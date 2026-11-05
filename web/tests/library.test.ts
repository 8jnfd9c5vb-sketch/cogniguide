import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = vi.hoisted(() => ({ n: 0 }));
const model = vi.hoisted(() => ({ hasKey: true }));

vi.mock("@/lib/bailian", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bailian")>("@/lib/bailian");
  return { ...actual, hasApiKey: () => model.hasKey };
});

vi.mock("@/lib/quiz", () => ({
  generateQuestions: vi.fn(
    async (
      chunks: Array<{ id: string; subject: string; materialId: string }>,
      count: number,
      language: string,
      level: string,
    ) =>
      Array.from({ length: count }, () => ({
        id: `q${String(ids.n++).padStart(7, "0")}`,
        question: "From notes",
        referenceAnswer: "Answer",
        evidence: "evidence",
        chunkIds: chunks.slice(0, 1).map((c) => c.id),
        subject: chunks[0].subject,
        materialId: chunks[0].materialId,
        language,
        level,
        origin: "notes" as const,
      })),
  ),
  generateKnowledgeQuestions: vi.fn(
    async (subject: { slug: string }, count: number, language: string, level: string) =>
      Array.from({ length: count }, () => ({
        id: `k${String(ids.n++).padStart(7, "0")}`,
        question: "From knowledge",
        referenceAnswer: "Answer",
        evidence: "points",
        chunkIds: [],
        subject: subject.slug,
        materialId: "",
        language,
        level,
        origin: "knowledge" as const,
      })),
  ),
}));

vi.mock("@/lib/rag", () => ({
  search: vi.fn(async () => []),
  sampleChunks: vi.fn(async () => []),
  chunkCountsBySubject: vi.fn(async () => ({})),
  deleteMaterialVectors: vi.fn(async () => {}),
  deleteSubjectVectors: vi.fn(async () => {}),
  IndexMismatchError: class IndexMismatchError extends Error {},
}));

vi.mock("@/lib/jobs", () => ({ enqueue: vi.fn() }));

vi.mock("@/lib/extract", () => ({ countPdfPages: vi.fn(async () => 1) }));

import { countPdfPages } from "@/lib/extract";
import { enqueue } from "@/lib/jobs";
import {
  buildQuickQuiz,
  buildReviewQuiz,
  buildSubjectQuiz,
  recordMistakes,
  removeMaterial,
  removeSubject,
  subjectSummaries,
  toUserMessage,
  uploadMaterial,
  UserError,
} from "@/lib/library";
import { chunkCountsBySubject, IndexMismatchError, sampleChunks, search } from "@/lib/rag";
import { generateKnowledgeQuestions, generateQuestions } from "@/lib/quiz";
import { PASS_SCORE } from "@/lib/scoring";
import {
  createSubject,
  getMaterial,
  getMistake,
  getQuiz,
  getSubject,
  listMistakes,
} from "@/lib/storage";
import type { GradedItem } from "@/lib/types";
import { makeChunk, makeQuestion } from "./helpers";

const notes = vi.mocked(generateQuestions);
const knowledge = vi.mocked(generateKnowledgeQuestions);

beforeEach(() => {
  ids.n = 0;
  model.hasKey = true;
  notes.mockClear();
  knowledge.mockClear();
  vi.mocked(search).mockReset();
  vi.mocked(search).mockResolvedValue([]);
  vi.mocked(sampleChunks).mockReset();
  vi.mocked(sampleChunks).mockResolvedValue([]);
  vi.mocked(enqueue).mockClear();
  vi.mocked(countPdfPages).mockReset();
  vi.mocked(countPdfPages).mockResolvedValue(1);
});

function graded(questionId: string, score: number): GradedItem {
  return {
    questionId,
    subject: "math",
    materialId: "mat1",
    chunkIds: [],
    question: "Q",
    answer: "A",
    referenceAnswer: "R",
    score,
    correctPoints: [],
    missedPoints: ["missed"],
    feedback: "Review this.",
  };
}

describe("uploadMaterial", () => {
  it("accepts an image, stores it and queues processing", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "notes.png");
    const meta = await uploadMaterial("math", file);
    expect(meta).toMatchObject({ subject: "math", kind: "image", status: "processing", fileName: "notes.png" });
    expect(enqueue).toHaveBeenCalledWith("math", meta.id);
    expect(await getMaterial("math", meta.id)).not.toBeNull();
  });

  it("refuses an upload when no model is configured", async () => {
    model.hasKey = false;
    const file = new File([new Uint8Array([1, 2, 3])], "notes.png");
    await expect(uploadMaterial("math", file)).rejects.toThrow(/DASHSCOPE_API_KEY is not set/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects an unknown subject, a bad type, an empty file and an oversized file", async () => {
    await expect(uploadMaterial("missing", new File([new Uint8Array([1])], "a.png"))).rejects.toThrow(
      /not found/,
    );
    await expect(uploadMaterial("math", new File([new Uint8Array([1])], "a.exe"))).rejects.toThrow(/PDF, PNG/);
    await expect(uploadMaterial("math", new File([], "a.png"))).rejects.toThrow(/empty/);
    const big = new File([new Uint8Array(26 * 1024 * 1024)], "big.png");
    await expect(uploadMaterial("math", big)).rejects.toThrow(/larger than 25 MB/);
  });

  it("checks the PDF page count", async () => {
    const pdf = () => new File([new Uint8Array([1])], "notes.pdf");
    vi.mocked(countPdfPages).mockResolvedValueOnce(0);
    await expect(uploadMaterial("math", pdf())).rejects.toThrow(/no pages/);
    vi.mocked(countPdfPages).mockResolvedValueOnce(80);
    await expect(uploadMaterial("math", pdf())).rejects.toThrow(/80 pages/);
    vi.mocked(countPdfPages).mockRejectedValueOnce(new Error("bad"));
    await expect(uploadMaterial("math", pdf())).rejects.toThrow(/could not be opened/);
    vi.mocked(countPdfPages).mockResolvedValueOnce(4);
    const meta = await uploadMaterial("math", pdf());
    expect(meta).toMatchObject({ kind: "pdf", pages: 4, ext: ".pdf" });
  });
});

describe("subject summaries and deletion", () => {
  it("counts materials and indexed chunks per subject", async () => {
    vi.mocked(chunkCountsBySubject).mockResolvedValue({ math: 4 });
    const before = (await subjectSummaries()).find((s) => s.slug === "math")!;
    await uploadMaterial("math", new File([new Uint8Array([1])], "a.png"));
    const after = (await subjectSummaries()).find((s) => s.slug === "math")!;
    expect((await subjectSummaries()).map((s) => s.slug)).toEqual(["chinese", "english", "math", "geography"]);
    expect(after.materialCount).toBe(before.materialCount + 1);
    expect(after.chunkCount).toBe(4);
    expect(after.processingCount).toBe(before.processingCount + 1);
  });

  it("removes a material's files and a subject's mistakes", async () => {
    const meta = await uploadMaterial("english", new File([new Uint8Array([1])], "a.png"));
    await removeMaterial("english", meta.id);
    expect(await getMaterial("english", meta.id)).toBeNull();

    const subject = await (await import("@/lib/storage")).createSubject("Disposable");
    const question = makeQuestion({ id: "disp0001", subject: subject.slug });
    await recordMistakes([question], [graded(question.id, 10)]);
    await removeSubject(subject.slug);
    expect(await getSubject(subject.slug)).toBeNull();
    expect(await getMistake(question.id)).toBeNull();
  });
});

describe("quizzes", () => {
  it("builds a quick quiz across subjects, in each subject's language", async () => {
    const math = [makeChunk({ id: "m-0" }), makeChunk({ id: "m-1", chunkIndex: 1 }), makeChunk({ id: "m-2", chunkIndex: 2 })];
    const chinese = [
      makeChunk({ id: "c-0", subject: "chinese", materialId: "chn1" }),
      makeChunk({ id: "c-1", subject: "chinese", materialId: "chn1", chunkIndex: 1 }),
    ];
    vi.mocked(sampleChunks).mockResolvedValue([...math, ...chinese]);
    const session = await buildQuickQuiz("   ", "s4");
    expect(session.kind).toBe("quick");
    expect(session.topic).toBeUndefined();
    expect(session.questions).toHaveLength(5);
    expect(notes).toHaveBeenCalledWith(expect.arrayContaining([math[0]]), 3, "en", "s4");
    expect(notes).toHaveBeenCalledWith(expect.arrayContaining([chinese[0]]), 2, "zh", "s4");
    expect(await getQuiz(session.id)).toMatchObject({ id: session.id });
  });

  it("searches when a topic is given and reports a miss", async () => {
    await expect(buildQuickQuiz(undefined, "s3")).rejects.toThrow(/no indexed material/);
    const topic = `  ${"eigen".repeat(50)}  `;
    await expect(buildQuickQuiz(topic, "s3")).rejects.toThrow(/eigen/);
    expect(vi.mocked(search).mock.calls[0][0]).toHaveLength(200);
    vi.mocked(search).mockResolvedValue([{ ...makeChunk(), distance: 0 }]);
    const session = await buildQuickQuiz(" eigenvalues ", "s5");
    expect(session.topic).toBe("eigenvalues");
    expect(session.level).toBe("s5");
  });

  it("uses notes for a subject quiz and general knowledge when the subject has none", async () => {
    await expect(buildSubjectQuiz("missing", "s1")).rejects.toThrow(/not found/);
    vi.mocked(sampleChunks).mockResolvedValueOnce([makeChunk()]);
    const fromNotes = await buildSubjectQuiz("math", "s6");
    expect(fromNotes).toMatchObject({ kind: "subject", subject: "math", level: "s6" });
    expect(fromNotes.questions).toHaveLength(5);
    expect(fromNotes.questions.every((q) => q.origin === "notes")).toBe(true);

    const fromKnowledge = await buildSubjectQuiz("geography", "s2");
    expect(fromKnowledge.questions.every((q) => q.origin === "knowledge" && q.language === "en")).toBe(true);
    expect(knowledge).toHaveBeenCalledWith(expect.objectContaining({ slug: "geography" }), 5, "en", "s2");
  });

  it("reviews the least recently missed questions and skips mastered ones", async () => {
    await expect(buildReviewQuiz()).rejects.toThrow(/no mistakes/);
    const questions = Array.from({ length: 6 }, (_, i) => makeQuestion({ id: `rev${i}0000` }));
    for (let i = 0; i < questions.length; i++) {
      await recordMistakes([questions[i]], [graded(questions[i].id, 20)]);
      const saved = await getMistake(questions[i].id);
      await (await import("@/lib/storage")).saveMistake({
        ...saved!,
        lastWrongAt: `2024-01-0${i + 1}T00:00:00.000Z`,
      });
    }
    await recordMistakes([questions[0]], [graded(questions[0].id, PASS_SCORE)]);
    const session = await buildReviewQuiz("math");
    expect(session.kind).toBe("review");
    expect(session.questions.map((q) => q.id)).toEqual(["rev10000", "rev20000", "rev30000", "rev40000", "rev50000"]);
    await expect(buildReviewQuiz("geography")).rejects.toThrow(/no mistakes/);
  });

  it("keeps a question that points at the notes out of review rounds", async () => {
    const subject = await createSubject("Review filter");
    const copied = makeQuestion({
      id: "copied001",
      subject: subject.slug,
      question: "In question 16, $\\sin C \\approx 1.04$. Explain why triangle $ABC$ cannot be formed.",
    });
    const fresh = makeQuestion({
      id: "fresh0001",
      subject: subject.slug,
      question: "A triangle has $A = 40^\\circ$, $a = 7$ cm and $c = 12$ cm. Find $C$, or show that it cannot be formed.",
    });
    await recordMistakes([copied, fresh], [graded(copied.id, 10), graded(fresh.id, 10)]);
    expect(await getMistake(copied.id)).not.toBeNull();

    const session = await buildReviewQuiz(subject.slug);
    expect(session.questions.map((q) => q.id)).toEqual(["fresh0001"]);

    await removeSubject(subject.slug);
  });
});

describe("recordMistakes", () => {
  it("logs a failing answer, counts repeats and marks a later pass as mastered", async () => {
    const question = makeQuestion({ id: "track001" });
    await recordMistakes([question], [graded(question.id, PASS_SCORE)]);
    expect(await getMistake(question.id)).toBeNull();

    await recordMistakes([question], [graded(question.id, PASS_SCORE - 1)]);
    expect(await getMistake(question.id)).toMatchObject({ wrongCount: 1, lastScore: 59 });
    expect((await getMistake(question.id))?.masteredAt).toBeUndefined();

    await recordMistakes([question], [graded(question.id, 10)]);
    expect((await getMistake(question.id))?.wrongCount).toBe(2);

    await recordMistakes([question], [graded(question.id, 90)]);
    expect((await getMistake(question.id))?.masteredAt).toEqual(expect.any(String));

    await recordMistakes([question], [graded(question.id, 0)]);
    const again = await getMistake(question.id);
    expect(again).toMatchObject({ wrongCount: 3, lastScore: 0 });
    expect(again?.masteredAt).toBeUndefined();
    expect((await listMistakes()).some((m) => m.id === question.id)).toBe(true);
  });
});

describe("toUserMessage", () => {
  it("keeps user-facing errors and hides unexpected ones", () => {
    expect(toUserMessage(new UserError("Nope.", 404))).toEqual({ message: "Nope.", status: 404 });
    expect(toUserMessage(new IndexMismatchError("old")).status).toBe(400);
    expect(toUserMessage(new Error("disk full")).message).toContain("disk full");
    expect(toUserMessage("weird").status).toBe(500);
  });
});
