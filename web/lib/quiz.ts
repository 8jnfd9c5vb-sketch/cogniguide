import { chatJson } from "./bailian";
import { shortId } from "./fsutil";
import { DEFAULT_LEVEL, LEVEL_GUIDANCE, type Level } from "./levels";
import { getChunks } from "./rag";
import type { Chunk, GradedItem, Question, QuizLanguage } from "./types";

const LANGUAGE_RULE: Record<QuizLanguage, string> = {
  en: "Write everything in English.",
  zh: "所有输出内容（题目、参考答案、依据、反馈）都必须使用简体中文。",
};

function formatSources(chunks: Chunk[]): string {
  return chunks
    .map((c) => `<source id="${c.id}" page="${c.page}">\n${c.text}\n</source>`)
    .join("\n\n");
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asStringList = (v: unknown) =>
  Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, 8) : [];

/** Picks up to `max` chunks spread evenly across a material. */
export function spreadChunks(chunks: Chunk[], max: number): Chunk[] {
  if (chunks.length <= max) return chunks;
  const step = chunks.length / max;
  return Array.from({ length: max }, (_, i) => chunks[Math.floor(i * step)]);
}

export async function generateQuestions(
  chunks: Chunk[],
  count: number,
  language: QuizLanguage,
  level: Level,
): Promise<Question[]> {
  if (!chunks.length || count <= 0) return [];
  const validIds = new Set(chunks.map((c) => c.id));
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const system = `You are a teacher who writes short-answer questions that help a student actively recall their own study notes.
Student level: ${LEVEL_GUIDANCE[level]}
Rules:
- Use only facts, definitions, formulas and reasoning that appear in the provided sources. Never rely on outside knowledge.
- Match the difficulty, wording and expected answer length to the student level above, even if the notes themselves are more or less advanced.
- Each question must be answerable in a few sentences or a short derivation, and test understanding rather than trivia such as page numbers.
- Cover different parts of the sources and avoid near-duplicate questions.
- Keep mathematics in LaTeX ($...$).
- ${LANGUAGE_RULE[language]}
Return a JSON object: {"questions":[{"question":string,"referenceAnswer":string,"evidence":string,"chunkIds":string[]}]}
"evidence" is a short quote or paraphrase from the sources that supports the answer. "chunkIds" lists the source ids used.`;

  const user = `Write exactly ${count} questions from these sources.\n\n${formatSources(chunks)}`;

  return chatJson(system, user, (value) => {
    const list = (value as { questions?: unknown }).questions;
    if (!Array.isArray(list) || !list.length) throw new Error("no questions array");
    const questions: Question[] = [];
    for (const item of list.slice(0, count)) {
      const q = item as Record<string, unknown>;
      const question = asString(q.question);
      const referenceAnswer = asString(q.referenceAnswer);
      if (!question || !referenceAnswer) continue;
      let ids = asStringList(q.chunkIds).filter((id) => validIds.has(id));
      if (!ids.length) ids = chunks.slice(0, 3).map((c) => c.id);
      const first = byId.get(ids[0])!;
      questions.push({
        id: shortId(),
        question,
        referenceAnswer,
        evidence: asString(q.evidence),
        chunkIds: ids,
        subject: first.subject,
        materialId: first.materialId,
        language,
        level,
        origin: "notes",
      });
    }
    if (!questions.length) throw new Error("questions were empty");
    return questions;
  });
}

/** Used when a subject has no notes yet: questions come from the model's own subject knowledge. */
export async function generateKnowledgeQuestions(
  subject: { slug: string; name: string },
  count: number,
  language: QuizLanguage,
  level: Level,
): Promise<Question[]> {
  const system = `You are an experienced Hong Kong secondary school teacher of ${subject.name}.
Student level: ${LEVEL_GUIDANCE[level]}
Rules:
- Write short-answer questions on core topics a Hong Kong student at this level studies in ${subject.name}, following the local curriculum.
- Use well-established facts only; the reference answer must be accurate and complete.
- Each question must be answerable in a few sentences or a short derivation. Cover different topics and avoid near-duplicates.
- Keep mathematics in LaTeX ($...$).
- ${LANGUAGE_RULE[language]}
Return a JSON object: {"questions":[{"question":string,"referenceAnswer":string,"evidence":string}]}
"evidence" lists the key points a full answer must contain.`;

  const user = `Write exactly ${count} different questions. Variety seed: ${shortId()}.`;

  return chatJson(system, user, (value) => {
    const list = (value as { questions?: unknown }).questions;
    if (!Array.isArray(list) || !list.length) throw new Error("no questions array");
    const questions: Question[] = [];
    for (const item of list.slice(0, count)) {
      const q = item as Record<string, unknown>;
      const question = asString(q.question);
      const referenceAnswer = asString(q.referenceAnswer);
      if (!question || !referenceAnswer) continue;
      questions.push({
        id: shortId(),
        question,
        referenceAnswer,
        evidence: asString(q.evidence),
        chunkIds: [],
        subject: subject.slug,
        materialId: "",
        language,
        level,
        origin: "knowledge",
      });
    }
    if (!questions.length) throw new Error("questions were empty");
    return questions;
  });
}

const EMPTY_FEEDBACK: Record<QuizLanguage, string> = {
  en: "No answer was given.",
  zh: "未作答。",
};

export async function gradeAnswer(question: Question, answer: string): Promise<GradedItem> {
  const base = {
    questionId: question.id,
    subject: question.subject,
    materialId: question.materialId,
    chunkIds: question.chunkIds,
    question: question.question,
    answer,
    referenceAnswer: question.referenceAnswer,
  };
  if (!answer.trim()) {
    return { ...base, score: 0, correctPoints: [], missedPoints: [], feedback: EMPTY_FEEDBACK[question.language] };
  }

  const fromKnowledge = question.origin === "knowledge";
  const chunks = fromKnowledge ? [] : await getChunks(question.chunkIds);
  const sources = chunks.length
    ? formatSources(chunks)
    : `<source id="key-points">\n${question.evidence || question.referenceAnswer}\n</source>`;

  const system = `You grade a student's short answer ${fromKnowledge ? "to a general subject question" : "against their own study notes"}.
Student level: ${LEVEL_GUIDANCE[question.level ?? DEFAULT_LEVEL]}
Rules:
- Expect the depth and precision appropriate to that level: do not penalise a younger student for missing advanced detail the question did not ask for.
- ${
    fromKnowledge
      ? "Judge against the reference answer and key points, and accept other answers that are factually correct for the question."
      : "Judge only against the provided sources and reference answer."
  } Accept answers that are correct in substance even if worded differently or in another language.
- Score from 0 to 100: 100 means complete and correct, around 50 means partially correct, 0 means wrong or irrelevant.
- List the key points the student got right and the key points that are missing or wrong.
- Feedback is 1 to 3 encouraging sentences that tell the student what to review.
- ${LANGUAGE_RULE[question.language]}
Return a JSON object: {"score":number,"correctPoints":string[],"missedPoints":string[],"feedback":string}`;

  const user = `${sources}

Question: ${question.question}
Reference answer: ${question.referenceAnswer}
Student answer: ${answer}`;

  const graded = await chatJson(system, user, (value) => {
    const v = value as Record<string, unknown>;
    const score = Number(v.score);
    if (!Number.isFinite(score)) throw new Error("score missing");
    return {
      score: Math.round(Math.min(100, Math.max(0, score))),
      correctPoints: asStringList(v.correctPoints),
      missedPoints: asStringList(v.missedPoints),
      feedback: asString(v.feedback),
    };
  });
  return { ...base, ...graded };
}

export async function gradeAll(
  questions: Question[],
  answers: Record<string, string>,
): Promise<GradedItem[]> {
  return Promise.all(questions.map((q) => gradeAnswer(q, (answers[q.id] ?? "").slice(0, 5000))));
}
