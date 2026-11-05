import { chatJson } from "./bailian";
import { MIN_USEFUL_CHUNK_CHARS, cleanChunkText } from "./clean";
import { shortId } from "./fsutil";
import { DEFAULT_LEVEL, LEVEL_GUIDANCE, type Level } from "./levels";
import {
  answerKeyShape,
  lacksOwnGivens,
  looksNumerical,
  pointsAtTheSource,
  quotesTheSource,
} from "./originality";
import { getChunks } from "./rag";
import type { Chunk, GradedItem, Question, QuizLanguage } from "./types";
import { checkArithmetic } from "./verify";

const LANGUAGE_RULE: Record<QuizLanguage, string> = {
  en: "Write everything in English.",
  zh: "所有输出内容（题目、参考答案、依据、反馈）都必须使用简体中文。",
};

/** The line every answer key has to end with. */
const FINAL_ANSWER_LABEL: Record<QuizLanguage, string> = { en: "Answer:", zh: "答案：" };

/** The prompt demands the language's own label; the validator accepts the other one too. */
function labelChoices(language: QuizLanguage): string[] {
  const preferred = FINAL_ANSWER_LABEL[language];
  return [preferred, ...Object.values(FINAL_ANSWER_LABEL).filter((l) => l !== preferred)];
}

/** Rejection reasons are feedback, not a transcript: the model only needs the first few. */
const REPORTED_PROBLEMS = 6;

/** Asked for on top of the size of a set, because a key that fails a check costs one question, not the set. */
const EXTRA_QUESTIONS = 2;

function formatSources(chunks: Chunk[]): string {
  return chunks
    .map((c) => `<source id="${c.id}" page="${c.page}">\n${cleanChunkText(c.text)}\n</source>`)
    .join("\n\n");
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asStringList = (v: unknown) =>
  Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, 8) : [];
const asChecks = (v: unknown) => (Array.isArray(v) ? v.map(asString).filter(Boolean).slice(0, 6) : []);

/** Picks up to `max` chunks spread evenly across a material. */
export function spreadChunks(chunks: Chunk[], max: number): Chunk[] {
  if (chunks.length <= max) return chunks;
  const step = chunks.length / max;
  return Array.from({ length: max }, (_, i) => chunks[Math.floor(i * step)]);
}

/**
 * Drops the chunks that turned out to be only workbook furniture - headers, page marks, empty
 * question numbers - so they cannot use up one of the few source slots.
 */
export function usableChunks(chunks: Chunk[], max: number): Chunk[] {
  const useful = chunks
    .map((c) => ({ ...c, text: cleanChunkText(c.text) }))
    .filter((c) => c.text.length >= MIN_USEFUL_CHUNK_CHARS);
  return spreadChunks(useful, max);
}

const ORIGINALITY_RULES = `- The sources are worked solutions to numbered textbook problems. Never turn one of them into a question and never ask the student about them.
- Write a NEW problem that exercises the same method, the same syllabus requirement and the same reasoning, with its own numbers, names and context, chosen so that the answer printed in the sources no longer solves it.
- Change at least one given value, prefer a context the sources do not use, and keep the arithmetic calculator-friendly at this level.
- The problem must be self-contained: restate every given inside it, with its units. Never write "In question 16", "as in the notes", "the same diagram as above", "given on page 3" or "第 16 題".
- "evidence" quotes the passage whose method the new problem is modelled on.`;

function answerKeyRules(language: QuizLanguage): string {
  const label = FINAL_ANSWER_LABEL[language];
  return `- The reference answer is a marker's answer key, not a paraphrase: 3 to 6 numbered steps, one line each, in working order, naming the rule used in the step that uses it.
- End it with exactly one line starting "${label}" that carries the final value with its units. A key without numbered steps, or without that line, is rejected.
- Put every numerical claim into "checks": at most 6 plain-ASCII equations such as "11*sin(22.609)/sin(117) = 4.7461", one = per line, degrees for trigonometry, no LaTeX, no units, no variable names. A line may end in a range test with <, <=, > or >=, as in "27*sin(25)/11 = 1.0373 > 1". Angles in and out of sin, cos, tan, asin, acos and atan are degrees, so write "asin(0.9559) = 72.9" and never "asin(0.9559)*180/pi = 72.9". The last line must evaluate to the number you print after "${label}", so end the chain with "sqrt(169) = 13" rather than stopping at 169. Use "checks": [] when the answer needs no arithmetic.`;
}

/** For a model that cannot produce arithmetic we can verify: an exact expression beats a wrong number. */
function expressionKeyRules(language: QuizLanguage): string {
  const label = FINAL_ANSWER_LABEL[language];
  return `- The reference answer is a marker's answer key written in words and formulas: 3 to 6 numbered steps, one line each, naming the rule used in each step.
- End it with exactly one line starting "${label}" that gives the exact expression to evaluate, for example $\\frac{11\\sin 22.6^\\circ}{\\sin 117^\\circ}$, instead of a rounded number.
- Return "checks": [] and state no numerical result anywhere, because only the expression can be verified.`;
}

/**
 * Shown once because notes that are a wall of `$$ ... $$` one-liners make the model answer in the same
 * voice, and a single-line key is not a mark scheme. Only the shape is meant to be copied.
 */
const keyShapeExample = (label: string) => `A reference answer always looks like this, in any subject (do not reuse its wording or numbers):
1. name the rule or fact the step uses
2. substitute the values the question states
3. work out one intermediate, for example $\\sin C = \\frac{9 \\times 0.5}{14} = 0.3214$
${label} the final value, with its units
"checks" then carries that arithmetic, for example ["9*0.5/14 = 0.3214"].`;

const NOTES_SCHEMA =
  'Return a JSON object: {"questions":[{"question":string,"referenceAnswer":string,"evidence":string,"checks":string[],"chunkIds":string[]}]}\n"evidence" is a short quote from the sources that supports the answer. "chunkIds" lists the source ids used.';
/** One question as the model wrote it, before it is checked and stored. */
interface Draft {
  question: string;
  referenceAnswer: string;
  evidence: string;
  checks: string[];
  chunkIds: string[];
}

interface DraftRules {
  count: number;
  chunks: Chunk[];
  labels: string[];
  /** The notes' own text, for the verbatim-copy guard. Absent for questions from subject knowledge. */
  corpus?: string;
  /** Only the first attempt demands checks; a supplied but wrong claim is rejected on every attempt. */
  requireChecks: boolean;
  dropped: (reason: string) => void;
}

/** Two questions that share most of their phrasing ask the same thing. */
function nearDuplicate(existing: Draft[], candidate: string): string | null {
  const grams = (text: string) => {
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const out = new Set<string>();
    for (let i = 0; i + 4 <= words.length; i += 1) out.add(words.slice(i, i + 4).join(" "));
    return out;
  };
  const next = grams(candidate);
  if (!next.size) return null;
  for (const item of existing) {
    const other = grams(item.question);
    if (!other.size) continue;
    let shared = 0;
    for (const gram of next) if (other.has(gram)) shared += 1;
    if (shared / (next.size + other.size - shared) > 0.6) return "duplicates another question in this set";
  }
  return null;
}

function itemProblem(draft: Draft, rules: DraftRules, existing: Draft[]): string | null {
  if (draft.question.length < 15) return "question is too short to stand on its own";
  const arithmetic = checkArithmetic(draft.checks).join("; ");
  return (
    pointsAtTheSource(draft.question) ??
    pointsAtTheSource(draft.referenceAnswer) ??
    (rules.corpus ? quotesTheSource(draft.question, rules.corpus) : null) ??
    lacksOwnGivens(draft.question) ??
    answerKeyShape(draft.referenceAnswer, rules.labels) ??
    (rules.requireChecks && looksNumerical(draft.question) && !draft.checks.length
      ? 'works out a number but lists nothing in "checks", so the key cannot be verified'
      : null) ??
    (arithmetic || null) ??
    nearDuplicate(existing, draft.question)
  );
}

/**
 * Keeps the questions that pass and throws with the collected reasons when none do, so the retry is
 * told what was wrong instead of producing the same reply again at a lower temperature.
 */
function validateDrafts(value: unknown, rules: DraftRules): Draft[] {
  const list = (value as { questions?: unknown }).questions;
  if (!Array.isArray(list) || !list.length) throw new Error("no questions array");
  const validIds = new Set(rules.chunks.map((c) => c.id));
  const kept: Draft[] = [];
  const reasons: string[] = [];
  for (const item of list.slice(0, rules.count)) {
    const q = item as Record<string, unknown>;
    const draft: Draft = {
      question: asString(q.question),
      referenceAnswer: asString(q.referenceAnswer),
      evidence: asString(q.evidence),
      checks: asChecks(q.checks),
      chunkIds: asStringList(q.chunkIds).filter((id) => validIds.has(id)),
    };
    const problem =
      (!draft.question || !draft.referenceAnswer
        ? "question or reference answer is missing"
        : itemProblem(draft, rules, kept)) ?? null;
    if (problem) {
      if (reasons.length < REPORTED_PROBLEMS) {
        reasons.push(`${draft.question.slice(0, 60) || "(empty)"}: ${problem}`);
      }
      rules.dropped(problem);
      continue;
    }
    kept.push(draft);
  }
  if (!kept.length) throw new Error(reasons.join("; ") || "questions were empty");
  return kept;
}

async function askForDrafts(
  system: string,
  user: string,
  rulesForAttempt: (attempt: number) => DraftRules,
): Promise<Draft[] | null> {
  try {
    return await chatJson(system, user, (value, attempt) =>
      validateDrafts(value, rulesForAttempt(attempt)),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (reason) console.warn(`[quiz] no questions kept: ${reason}`);
    return null;
  }
}

function toQuestions(
  drafts: Draft[],
  chunks: Chunk[],
  language: QuizLanguage,
  level: Level,
): Question[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return drafts.map((draft) => {
    const ids = draft.chunkIds.length ? draft.chunkIds : chunks.slice(0, 3).map((c) => c.id);
    const first = byId.get(ids[0]);
    return {
      id: shortId(),
      question: draft.question,
      referenceAnswer: draft.referenceAnswer,
      evidence: draft.evidence,
      checks: draft.checks,
      chunkIds: ids,
      subject: first?.subject ?? "",
      materialId: first?.materialId ?? "",
      language,
      level,
      origin: "notes",
    };
  });
}

export async function generateQuestions(
  chunks: Chunk[],
  count: number,
  language: QuizLanguage,
  level: Level,
): Promise<Question[]> {
  if (!chunks.length || count <= 0) return [];
  const labels = labelChoices(language);
  const corpus = chunks.map((c) => cleanChunkText(c.text)).join("\n");
  /** Items are rejected one by one, so a couple extra in flight is what keeps a quiz the promised size. */
  const asked = count + EXTRA_QUESTIONS;
  const user = `Write exactly ${asked} questions from these sources.\n\n${formatSources(chunks)}`;
  const system = (keyRules: string) => `You are a teacher who writes short-answer problems that make a student apply the methods in their own study notes to an example they have not seen.
Student level: ${LEVEL_GUIDANCE[level]}
Rules:
- Use only the formulas, methods and facts that appear in the provided sources; never introduce a technique the notes do not use. The numbers you set are yours to choose.
- Match the difficulty and expected answer length to the student level above, even if the notes themselves are more or less advanced.
- Each problem must be answerable in a few sentences or a short derivation, and test understanding rather than recall of the notes themselves.
${ORIGINALITY_RULES}
${keyRules}
${keyShapeExample(labels[0])}
- Cover different methods from the sources and avoid near-duplicate questions.
- Keep mathematics in LaTeX ($...$) inside "question", "referenceAnswer" and "evidence".
- ${LANGUAGE_RULE[language]}
${NOTES_SCHEMA}`;

  const dropped = (reason: string) => console.warn(`[quiz] dropped a generated question: ${reason}`);
  const strict = await askForDrafts(system(answerKeyRules(language)), user, (attempt) => ({
    count: asked,
    chunks,
    labels,
    corpus,
    requireChecks: attempt === 0,
    dropped,
  }));
  if (strict?.length) return toQuestions(strict.slice(0, count), chunks, language, level);

  const fallback = await askForDrafts(system(expressionKeyRules(language)), user, () => ({
    count: asked,
    chunks,
    labels,
    corpus,
    requireChecks: false,
    dropped,
  }));
  if (fallback?.length) return toQuestions(fallback.slice(0, count), chunks, language, level);

  throw new Error("the model did not produce any usable questions from these notes");
}

/** Used when a subject has no notes yet: questions come from the model's own subject knowledge. */
export async function generateKnowledgeQuestions(
  subject: { slug: string; name: string },
  count: number,
  language: QuizLanguage,
  level: Level,
): Promise<Question[]> {
  const labels = labelChoices(language);
  const system = `You are an experienced Hong Kong secondary school teacher of ${subject.name}.
Student level: ${LEVEL_GUIDANCE[level]}
Rules:
- Write short-answer questions on core topics a Hong Kong student at this level studies in ${subject.name}, following the local curriculum.
- Use well-established facts only; the reference answer must be accurate and complete.
- Each question must stand on its own: state every value it needs, and never refer to a textbook, page or example.
- Each question must be answerable in a few sentences or a short derivation. Cover different topics and avoid near-duplicates.
${answerKeyRules(language)}
- Keep mathematics in LaTeX ($...$).
- ${LANGUAGE_RULE[language]}
Return a JSON object: {"questions":[{"question":string,"referenceAnswer":string,"evidence":string,"checks":string[]}]}
"evidence" lists the key points a full answer must contain. "checks" is the plain-ASCII arithmetic behind the key, or [] when there is none.`;

  const user = `Write exactly ${count + EXTRA_QUESTIONS} different questions. Variety seed: ${shortId()}.`;

  const drafts = await askForDrafts(system, user, (attempt) => ({
    count: count + EXTRA_QUESTIONS,
    chunks: [],
    labels,
    requireChecks: attempt === 0 && subject.slug === "math",
    dropped: (reason: string) => console.warn(`[quiz] dropped a knowledge question: ${reason}`),
  }));
  if (!drafts?.length) throw new Error("questions were empty");
  return drafts.slice(0, count).map((draft) => ({
    id: shortId(),
    question: draft.question,
    referenceAnswer: draft.referenceAnswer,
    evidence: draft.evidence,
    checks: draft.checks,
    chunkIds: [],
    subject: subject.slug,
    materialId: "",
    language,
    level,
    origin: "knowledge" as const,
  }));
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

  const system = `You grade a student's short answer ${fromKnowledge ? "to a general subject question" : "to a problem built from the method in their own study notes"}.
Student level: ${LEVEL_GUIDANCE[question.level ?? DEFAULT_LEVEL]}
Rules:
- Expect the depth and precision appropriate to that level: do not penalise a younger student for missing advanced detail the question did not ask for.
- ${
    fromKnowledge
      ? "Judge against the reference answer and key points, and accept other answers that are factually correct for the question."
      : "The sources show the method only. The question was written with its own numbers, so check every calculation against the data stated in the question, never against the numbers in the sources."
  } Accept answers that are correct in substance even if worded differently or in another language.
- The reference answer is a mark scheme: each numbered step earns one mark and its final line earns one more. Credit a correct method that arrives in fewer steps, in another order, or in plain prose; a one-sentence reference answer states the result, it is not a checklist.
- A different valid method earns full marks - the cosine rule where the key used the sine formula, for instance - and the method the student used is named in "correctPoints".
- Score from 0 to 100: 100 means complete and correct, around 50 means partially correct, 0 means wrong or irrelevant.
- A correct final answer with no working behind it, or with working that does not lead to it, is only half right: no method marks, so score at most 40 however certain the result looks.
- A result that cannot exist - a sine or a probability outside its range, a negative length, angles that do not add to 180 - scores below 40, unless the question asked whether that case is possible and the student says so with a reason.
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
