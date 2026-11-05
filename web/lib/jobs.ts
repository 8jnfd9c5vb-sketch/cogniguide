import { ExtractionError, extractText } from "./extract";
import { DEFAULT_LEVEL, type Level } from "./levels";
import { generateQuestions, usableChunks } from "./quiz";
import { chunkExtract, deleteMaterialVectors, indexChunks, materialChunks, resetIndex } from "./rag";
import {
  getMaterial,
  getQuestions,
  getSubject,
  listAllMaterials,
  originalPath,
  readExtract,
  saveQuestions,
  updateMaterial,
  writeExtract,
} from "./storage";
import type { Question } from "./types";

const QUESTIONS_PER_MATERIAL = 5;
const CHUNKS_FOR_QUESTIONS = 8;

interface Job {
  subject: string;
  id: string;
}

// One queue per process, shared by every copy of this module that Next.js loads.
const shared = globalThis as typeof globalThis & {
  __cogniJobs?: { queue: Job[]; queued: Set<string>; running: boolean };
  __cogniQuestionGen?: Map<string, Promise<Question[]>>;
};
const state = (shared.__cogniJobs ??= { queue: [], queued: new Set(), running: false });

const keyOf = (job: Job) => `${job.subject}/${job.id}`;

export function enqueue(subject: string, id: string): void {
  const job = { subject, id };
  if (state.queued.has(keyOf(job))) return;
  state.queued.add(keyOf(job));
  state.queue.push(job);
  void drain();
}

async function drain(): Promise<void> {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const job = state.queue.shift()!;
      try {
        await processMaterial(job);
      } catch (err) {
        console.error(`[jobs] ${keyOf(job)} crashed`, err);
      } finally {
        state.queued.delete(keyOf(job));
      }
    }
  } finally {
    state.running = false;
  }
}

class Deleted extends Error {}

async function processMaterial({ subject, id }: Job): Promise<void> {
  const step = async (patch: Parameters<typeof updateMaterial>[2]) => {
    const next = await updateMaterial(subject, id, patch);
    if (!next) throw new Deleted();
    return next;
  };

  try {
    let meta = await getMaterial(subject, id);
    if (!meta) return;
    const subjectInfo = await getSubject(subject);
    if (!subjectInfo) return;

    let text = meta.extracted ? await readExtract(subject, id) : null;
    if (text === null) {
      text = await extractText(originalPath(meta), meta.kind, (page, total) =>
        step({ step: `Transcribing page ${page} of ${total}` }).then(() => undefined),
      );
      await writeExtract(subject, id, text);
      meta = await step({ extracted: true });
    }

    await step({ step: "Indexing for search" });
    const chunks = chunkExtract(text, { subject, materialId: id, fileName: meta.fileName });
    if (!chunks.length) throw new Error("No study content was found in this file.");
    await indexChunks(id, chunks);
    meta = await step({ chunkCount: chunks.length });

    let questions = await getQuestions(subject, id, DEFAULT_LEVEL);
    if (!questions.length) {
      await step({ step: "Writing questions" });
      questions = await generateQuestions(
        usableChunks(chunks, CHUNKS_FOR_QUESTIONS),
        QUESTIONS_PER_MATERIAL,
        subjectInfo.quizLanguage,
        DEFAULT_LEVEL,
      );
      await saveQuestions(subject, id, DEFAULT_LEVEL, questions);
    }

    await step({
      status: "ready",
      step: undefined,
      error: undefined,
      failedPages: undefined,
      questionCount: questions.length,
    });
  } catch (err) {
    if (err instanceof Deleted) {
      await deleteMaterialVectors(id);
      return;
    }
    console.error(`[jobs] ${subject}/${id} failed`, err);
    await updateMaterial(subject, id, {
      status: "failed",
      step: undefined,
      error: err instanceof Error ? err.message : String(err),
      failedPages: err instanceof ExtractionError ? err.failedPages : undefined,
    });
  }
}

const inflight = (shared.__cogniQuestionGen ??= new Map());

/**
 * Returns the cached questions for a ready material at `level`, writing them on first use.
 * Concurrent requests for the same material and level share one generation.
 */
export async function ensureQuestions(subject: string, id: string, level: Level): Promise<Question[]> {
  const cached = await getQuestions(subject, id, level);
  if (cached.length) return cached;
  const key = `${subject}/${id}/${level}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const subjectInfo = await getSubject(subject);
      const chunks = await materialChunks(id);
      if (!subjectInfo || !chunks.length) return [];
      const questions = await generateQuestions(
        usableChunks(chunks, CHUNKS_FOR_QUESTIONS),
        QUESTIONS_PER_MATERIAL,
        subjectInfo.quizLanguage,
        level,
      );
      if (await getMaterial(subject, id)) {
        await saveQuestions(subject, id, level, questions);
        // The panel prints the default level's set, so another level must not overwrite that count.
        if (level === DEFAULT_LEVEL) {
          await updateMaterial(subject, id, { questionCount: questions.length });
        }
      }
      return questions;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Requeues interrupted work and repairs counts a previous build left stale. */
export async function resumePending(): Promise<void> {
  const materials = await listAllMaterials();
  for (const m of materials) {
    if (m.status === "processing") {
      enqueue(m.subject, m.id);
      continue;
    }
    if (m.status !== "ready") continue;
    const cached = await getQuestions(m.subject, m.id, DEFAULT_LEVEL);
    if (cached.length && cached.length !== m.questionCount) {
      await updateMaterial(m.subject, m.id, { questionCount: cached.length });
    }
  }
}

/** Drops the vector index and re-embeds every material that already has a transcript. */
export async function rebuildIndex(): Promise<number> {
  await resetIndex();
  const materials = await listAllMaterials();
  let count = 0;
  for (const m of materials) {
    if (!m.extracted) continue;
    await updateMaterial(m.subject, m.id, { status: "processing", step: "Queued for re-indexing", chunkCount: 0 });
    enqueue(m.subject, m.id);
    count++;
  }
  return count;
}
