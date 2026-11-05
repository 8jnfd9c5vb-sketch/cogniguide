import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bailian", () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
}));

vi.mock("@/lib/extract", () => ({
  extractText: vi.fn(),
  ExtractionError: class ExtractionError extends Error {
    failedPages: number[];
    constructor(message: string, failedPages: number[]) {
      super(message);
      this.failedPages = failedPages;
    }
  },
}));

const ids = vi.hoisted(() => ({ n: 0 }));

vi.mock("@/lib/quiz", () => ({
  usableChunks: <T>(chunks: T[], max: number) => chunks.slice(0, max),
  generateQuestions: vi.fn(
    async (
      chunks: Array<{ id: string; subject: string; materialId: string }>,
      count: number,
      language: string,
      level: string,
    ) =>
      Array.from({ length: count }, () => ({
        id: `j${String(ids.n++).padStart(7, "0")}`,
        question: "Generated",
        referenceAnswer: "Answer",
        evidence: "evidence",
        chunkIds: [chunks[0].id],
        subject: chunks[0].subject,
        materialId: chunks[0].materialId,
        language,
        level,
        origin: "notes" as const,
      })),
  ),
}));

import { ExtractionError, extractText } from "@/lib/extract";
import { ensureQuestions, enqueue, rebuildIndex, resumePending } from "@/lib/jobs";
import { generateQuestions } from "@/lib/quiz";
import { createMaterial, getMaterial, getQuestions, listAllMaterials, listSubjects, updateMaterial } from "@/lib/storage";

const transcript = "## Page 1\n\nA subspace is closed under addition.\n";
const transcribe = vi.mocked(extractText);
const questions = vi.mocked(generateQuestions);

beforeEach(async () => {
  // Seeding must happen before the first material directory is created, or the
  // default subjects are never written and the job cannot find the subject.
  await listSubjects();
  transcribe.mockReset();
  transcribe.mockImplementation(async (_file, _kind, onProgress) => {
    await onProgress(1, 1);
    return transcript;
  });
});

async function add(subject: string) {
  return createMaterial({
    subject,
    fileName: "notes.png",
    kind: "image",
    ext: ".png",
    data: new Uint8Array([1, 2, 3]),
    pages: 1,
  });
}

async function settle() {
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    const all = await listAllMaterials();
    if (all.every((m) => m.status !== "processing")) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("processing did not finish");
}

describe("material processing", () => {
  it("transcribes, indexes and writes the default-level questions", async () => {
    const meta = await add("chinese");
    enqueue("chinese", meta.id);
    await settle();
    expect(await getMaterial("chinese", meta.id)).toMatchObject({
      status: "ready",
      extracted: true,
      chunkCount: 1,
      questionCount: 5,
    });
    expect(questions).toHaveBeenCalledWith(expect.any(Array), 5, "zh", "s3");
    expect(await getQuestions("chinese", meta.id, "s3")).toHaveLength(5);
    expect(await getQuestions("chinese", meta.id, "s1")).toEqual([]);
  });

  it("ignores a duplicate enqueue while the first job is still queued", async () => {
    transcribe.mockClear();
    const meta = await add("math");
    enqueue("math", meta.id);
    enqueue("math", meta.id);
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("records the failed pages when transcription throws", async () => {
    transcribe.mockRejectedValue(new ExtractionError("vision timed out", [1]));
    const meta = await add("math");
    enqueue("math", meta.id);
    await settle();
    expect(await getMaterial("math", meta.id)).toMatchObject({
      status: "failed",
      failedPages: [1],
      error: expect.stringContaining("vision timed out"),
    });
  });

  it("fails when the file has no study content", async () => {
    transcribe.mockResolvedValue("## Page 1\n\n");
    const meta = await add("english");
    enqueue("english", meta.id);
    await settle();
    expect((await getMaterial("english", meta.id))?.error).toMatch(/No study content/);
  });

  it("resumes materials left in processing and does not touch finished ones", async () => {
    const calls = transcribe.mock.calls.length;
    await resumePending();
    await settle();
    expect(transcribe.mock.calls.length).toBe(calls);

    const meta = await add("geography");
    await resumePending();
    await settle();
    expect(await getMaterial("geography", meta.id)).toMatchObject({ status: "ready" });
  });

  it("repairs a question count an older build left stale", async () => {
    const meta = await add("math");
    enqueue("math", meta.id);
    await settle();
    await updateMaterial("math", meta.id, { questionCount: 2 });
    await resumePending();
    expect((await getMaterial("math", meta.id))?.questionCount).toBe(5);
  });

  it("reindexes an extracted material without transcribing or rewriting questions", async () => {
    const meta = await add("math");
    enqueue("math", meta.id);
    await settle();
    transcribe.mockClear();
    questions.mockClear();
    expect(await rebuildIndex()).toBeGreaterThanOrEqual(1);
    await settle();
    expect(transcribe).not.toHaveBeenCalled();
    expect(questions).not.toHaveBeenCalled();
    expect(await getMaterial("math", meta.id)).toMatchObject({ status: "ready", chunkCount: 1 });
  });

  it("keeps the panel count from the default level when another level is generated", async () => {
    const meta = await add("math");
    enqueue("math", meta.id);
    await settle();
    questions.mockImplementationOnce(async (chunks, _count, language, level) =>
      [0, 1].map((n) => ({
        id: `s5_${n}`,
        question: `Shorter set ${n}`,
        referenceAnswer: "Answer",
        evidence: "evidence",
        chunkIds: [chunks[0].id],
        subject: "math",
        materialId: meta.id,
        language,
        level,
        origin: "notes" as const,
      })),
    );
    expect(await ensureQuestions("math", meta.id, "s5")).toHaveLength(2);
    expect((await getMaterial("math", meta.id))?.questionCount).toBe(5);
    expect(await getQuestions("math", meta.id, "s5")).toHaveLength(2);
  });

  it("generates another level once and shares the in-flight request", async () => {
    const meta = await add("math");
    enqueue("math", meta.id);
    await settle();
    questions.mockClear();
    const [first, second] = await Promise.all([
      ensureQuestions("math", meta.id, "s6"),
      ensureQuestions("math", meta.id, "s6"),
    ]);
    expect(questions).toHaveBeenCalledTimes(1);
    expect(questions).toHaveBeenCalledWith(expect.any(Array), 5, "en", "s6");
    expect(first.map((q) => q.id)).toEqual(second.map((q) => q.id));
    expect(await ensureQuestions("math", meta.id, "s6")).toHaveLength(5);
    expect(questions).toHaveBeenCalledTimes(1);
  });
});
