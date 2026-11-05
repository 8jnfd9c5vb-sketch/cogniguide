import path from "node:path";
import { MissingApiKeyError } from "./bailian";
import { config, SUPPORTED_UPLOADS } from "./config";
import { countPdfPages } from "./extract";
import { safeFileName, shortId } from "./fsutil";
import { enqueue } from "./jobs";
import { DEFAULT_LEVEL, type Level } from "./levels";
import { generateKnowledgeQuestions, generateQuestions } from "./quiz";
import { PASS_SCORE } from "./scoring";
import {
  chunkCountsBySubject,
  deleteMaterialVectors,
  deleteSubjectVectors,
  IndexMismatchError,
  sampleChunks,
  search,
} from "./rag";
import {
  createMaterial,
  deleteMaterialFiles,
  deleteMistake,
  deleteSubjectFiles,
  getMistake,
  getSubject,
  listMaterials,
  listMistakes,
  listSubjects,
  saveMistake,
  saveQuiz,
} from "./storage";
import type { Chunk, GradedItem, MaterialMeta, Question, QuickQuizSession, Subject } from "./types";

/** An error whose message is safe and useful to show in the UI. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function toUserMessage(err: unknown): { message: string; status: number } {
  if (err instanceof UserError) return { message: err.message, status: err.status };
  if (err instanceof MissingApiKeyError || err instanceof IndexMismatchError) {
    return { message: err.message, status: 400 };
  }
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  return { message: `Something went wrong: ${message}`, status: 500 };
}

export interface SubjectSummary extends Subject {
  materialCount: number;
  readyCount: number;
  processingCount: number;
  chunkCount: number;
}

export async function subjectSummaries(): Promise<SubjectSummary[]> {
  const [subjects, counts] = await Promise.all([listSubjects(), chunkCountsBySubject()]);
  return Promise.all(
    subjects.map(async (s) => {
      const materials = await listMaterials(s.slug);
      return {
        ...s,
        materialCount: materials.length,
        readyCount: materials.filter((m) => m.status === "ready").length,
        processingCount: materials.filter((m) => m.status === "processing").length,
        chunkCount: counts[s.slug] ?? 0,
      };
    }),
  );
}

export async function uploadMaterial(slug: string, file: File): Promise<MaterialMeta> {
  const subject = await getSubject(slug);
  if (!subject) throw new UserError("Subject not found.", 404);

  const ext = path.extname(file.name).toLowerCase();
  const kind = SUPPORTED_UPLOADS[ext];
  if (!kind) throw new UserError("Only PDF, PNG, JPG and WEBP files are supported.");
  if (file.size > config.maxUploadMb * 1024 * 1024) {
    throw new UserError(`File is larger than ${config.maxUploadMb} MB.`);
  }
  if (file.size === 0) throw new UserError("File is empty.");

  const data = new Uint8Array(await file.arrayBuffer());
  let pages = 1;
  if (kind === "pdf") {
    try {
      pages = await countPdfPages(data);
    } catch {
      throw new UserError("This PDF could not be opened. It may be damaged or password-protected.");
    }
    if (pages < 1) throw new UserError("This PDF has no pages.");
    if (pages > config.maxPdfPages) {
      throw new UserError(
        `This PDF has ${pages} pages; the limit is ${config.maxPdfPages}. Split it into smaller files.`,
      );
    }
  }

  const meta = await createMaterial({
    subject: slug,
    fileName: safeFileName(file.name),
    kind,
    ext: ext === ".jpeg" ? ".jpg" : ext,
    data,
    pages,
  });
  enqueue(slug, meta.id);
  return meta;
}

export async function removeMaterial(slug: string, id: string): Promise<void> {
  await deleteMaterialVectors(id);
  await deleteMaterialFiles(slug, id);
}

export async function removeSubject(slug: string): Promise<void> {
  await deleteSubjectVectors(slug);
  await deleteSubjectFiles(slug);
  const mistakes = await listMistakes();
  await Promise.all(mistakes.filter((m) => m.question.subject === slug).map((m) => deleteMistake(m.id)));
}

const QUICK_QUIZ_QUESTIONS = 5;
const QUICK_QUIZ_CHUNKS = 10;

/** Splits `total` questions across subject groups, larger groups first. */
function allocate(groups: Chunk[][], total: number): number[] {
  const counts = groups.map(() => 0);
  const order = groups.map((_, i) => i).sort((a, b) => groups[b].length - groups[a].length);
  for (let n = 0; n < total; n++) counts[order[n % order.length]]++;
  return counts;
}

export async function buildQuickQuiz(topic: string | undefined, level: Level): Promise<QuickQuizSession> {
  const cleanTopic = topic?.trim().slice(0, 200) || undefined;
  const chunks: Chunk[] = cleanTopic
    ? await search(cleanTopic, { limit: QUICK_QUIZ_CHUNKS })
    : await sampleChunks(QUICK_QUIZ_CHUNKS);
  if (!chunks.length) {
    throw new UserError(
      cleanTopic
        ? `None of your notes match "${cleanTopic}". Try another topic or leave it empty for a random quiz.`
        : "There is no indexed material yet. Upload notes to a subject first.",
    );
  }

  const bySubject = new Map<string, Chunk[]>();
  for (const c of chunks) bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
  const groups = [...bySubject.values()].slice(0, QUICK_QUIZ_QUESTIONS);
  const counts = allocate(groups, QUICK_QUIZ_QUESTIONS);

  const perGroup = await Promise.all(
    groups.map(async (group, i) => {
      const subject = await getSubject(group[0].subject);
      return generateQuestions(group, counts[i], subject?.quizLanguage ?? "en", level);
    }),
  );

  const session: QuickQuizSession = {
    id: shortId(),
    kind: "quick",
    topic: cleanTopic,
    level,
    createdAt: new Date().toISOString(),
    questions: perGroup.flat(),
  };
  await saveQuiz(session);
  return session;
}

const SUBJECT_QUIZ_QUESTIONS = 5;
const SUBJECT_QUIZ_CHUNKS = 10;

/** Five questions from a random sample of the subject's notes, or from subject knowledge if it has none. */
export async function buildSubjectQuiz(slug: string, level: Level): Promise<QuickQuizSession> {
  const subject = await getSubject(slug);
  if (!subject) throw new UserError("Subject not found.", 404);
  const chunks = await sampleChunks(SUBJECT_QUIZ_CHUNKS, slug);
  const questions = chunks.length
    ? await generateQuestions(chunks, SUBJECT_QUIZ_QUESTIONS, subject.quizLanguage, level)
    : await generateKnowledgeQuestions(subject, SUBJECT_QUIZ_QUESTIONS, subject.quizLanguage, level);
  const session: QuickQuizSession = {
    id: shortId(),
    kind: "subject",
    subject: slug,
    level,
    createdAt: new Date().toISOString(),
    questions,
  };
  await saveQuiz(session);
  return session;
}

const REVIEW_SIZE = 5;

/** Up to five unmastered mistakes, least recently missed first, optionally for one subject. */
export async function buildReviewQuiz(subject?: string): Promise<QuickQuizSession> {
  const open = (await listMistakes()).filter((m) => !m.masteredAt && (!subject || m.question.subject === subject));
  if (!open.length) throw new UserError("There are no mistakes to review.");
  const picked = open.reverse().slice(0, REVIEW_SIZE);
  const session: QuickQuizSession = {
    id: shortId(),
    kind: "review",
    subject,
    level: picked[0].question.level ?? DEFAULT_LEVEL,
    createdAt: new Date().toISOString(),
    questions: picked.map((m) => m.question),
  };
  await saveQuiz(session);
  return session;
}

/** Logs failed answers and marks previously logged questions mastered once they are answered well. */
export async function recordMistakes(questions: Question[], items: GradedItem[]): Promise<void> {
  const now = new Date().toISOString();
  const byId = new Map(questions.map((q) => [q.id, q]));
  await Promise.all(
    items.map(async (item) => {
      const question = byId.get(item.questionId);
      if (!question) return;
      const existing = await getMistake(question.id);
      if (item.score >= PASS_SCORE) {
        if (existing && !existing.masteredAt) await saveMistake({ ...existing, masteredAt: now });
        return;
      }
      await saveMistake({
        id: question.id,
        question,
        lastAnswer: item.answer,
        lastScore: item.score,
        feedback: item.feedback,
        missedPoints: item.missedPoints,
        wrongCount: (existing?.wrongCount ?? 0) + 1,
        firstWrongAt: existing?.firstWrongAt ?? now,
        lastWrongAt: now,
      });
    }),
  );
}
