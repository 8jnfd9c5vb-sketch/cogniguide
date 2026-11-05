import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bailian", () => ({
  chatJson: vi.fn(),
}));
vi.mock("@/lib/rag", () => ({
  getChunks: vi.fn(async () => []),
}));

import { chatJson } from "@/lib/bailian";
import { getChunks } from "@/lib/rag";
import { generateKnowledgeQuestions, generateQuestions, gradeAll, gradeAnswer, spreadChunks } from "@/lib/quiz";
import { makeChunk, makeQuestion } from "./helpers";

const chat = vi.mocked(chatJson);
const chunks = vi.mocked(getChunks);

beforeEach(() => {
  chat.mockReset();
  chunks.mockReset();
  chunks.mockResolvedValue([]);
});

describe("spreadChunks", () => {
  const all = Array.from({ length: 10 }, (_, i) => makeChunk({ id: `c${i}`, chunkIndex: i }));

  it("returns the input when it already fits", () => {
    expect(spreadChunks(all.slice(0, 3), 8)).toHaveLength(3);
    expect(spreadChunks([], 8)).toEqual([]);
  });

  it("picks evenly spaced chunks", () => {
    expect(spreadChunks(all, 4).map((c) => c.chunkIndex)).toEqual([0, 2, 5, 7]);
  });
});

describe("generateQuestions", () => {
  const source = [
    makeChunk({ id: "m-0" }),
    makeChunk({ id: "m-1", text: "Second chunk.", chunkIndex: 1 }),
    makeChunk({ id: "m-2", text: "Third chunk.", chunkIndex: 2 }),
  ];

  it("returns nothing without sources", async () => {
    expect(await generateQuestions([], 5, "en", "s3")).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it("asks for the level and language, and keeps only known source ids", async () => {
    chat.mockImplementation(async (system, _user, validate) => {
      expect(system).toContain("Secondary 1");
      expect(system).toContain("简体中文");
      return validate({
        questions: [
          { question: "  Q1 ", referenceAnswer: " A1 ", evidence: "E1", chunkIds: ["m-1", "nope"] },
          { question: "", referenceAnswer: "A" },
          { question: "Q2", referenceAnswer: "A2", evidence: "E2", chunkIds: ["missing"] },
        ],
      });
    });
    const questions = await generateQuestions(source, 5, "zh", "s1");
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      question: "Q1",
      referenceAnswer: "A1",
      chunkIds: ["m-1"],
      subject: "math",
      language: "zh",
      level: "s1",
      origin: "notes",
    });
    expect(questions[1].chunkIds).toEqual(["m-0", "m-1", "m-2"]);
    expect(questions[0].id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("rejects a reply with no usable questions", async () => {
    chat.mockImplementation(async (_s, _u, validate) => validate({ questions: [] }));
    await expect(generateQuestions(source, 2, "en", "s3")).rejects.toThrow(/no questions/);
  });
});

describe("generateKnowledgeQuestions", () => {
  it("writes subject questions with no note sources", async () => {
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("Geography");
      expect(system).toContain("Secondary 2");
      expect(user).toContain("Write exactly 5");
      return validate({
        questions: [{ question: "Why is Hong Kong humid?", referenceAnswer: "Monsoon.", evidence: "monsoon" }],
      });
    });
    const questions = await generateKnowledgeQuestions({ slug: "geography", name: "Geography" }, 5, "en", "s2");
    expect(questions[0]).toMatchObject({
      subject: "geography",
      materialId: "",
      chunkIds: [],
      origin: "knowledge",
      level: "s2",
    });
  });
});

describe("grading", () => {
  it("scores a blank answer without calling the model", async () => {
    const item = await gradeAnswer(makeQuestion({ language: "zh" }), "   ");
    expect(item).toMatchObject({ score: 0, feedback: "未作答。", correctPoints: [], missedPoints: [] });
    expect(chat).not.toHaveBeenCalled();
  });

  it("clamps the score and grades knowledge questions against the reference answer", async () => {
    chunks.mockResolvedValue([makeChunk()]);
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("general subject");
      expect(user).toContain("key-points");
      expect(chunks).not.toHaveBeenCalled();
      return validate({ score: 140, correctPoints: ["right"], missedPoints: "nope", feedback: "Good." });
    });
    const item = await gradeAnswer(makeQuestion({ origin: "knowledge", chunkIds: [], level: "s6" }), "Because.");
    expect(item.score).toBe(100);
    expect(item.missedPoints).toEqual([]);
    expect(item.correctPoints).toEqual(["right"]);
  });

  it("quotes the original chunks when the question came from notes", async () => {
    chunks.mockResolvedValue([makeChunk({ id: "mat1-0", text: "Closed under addition." })]);
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("study notes");
      expect(system).toContain("Secondary 4");
      expect(user).toContain('id="mat1-0"');
      expect(user).toContain("Closed under addition.");
      return validate({ score: -5, correctPoints: [], missedPoints: ["closure"], feedback: "Review." });
    });
    const item = await gradeAnswer(makeQuestion({ level: "s4" }), "I think so");
    expect(item.score).toBe(0);
    expect(chunks).toHaveBeenCalledWith(["mat1-0"]);
  });

  it("grades every question and caps long answers", async () => {
    chat.mockImplementation(async (_s, user, validate) => {
      expect(user.length).toBeLessThan(6000);
      return validate({ score: 80, correctPoints: [], missedPoints: [], feedback: "Fine." });
    });
    const first = makeQuestion({ id: "blank001" });
    const second = makeQuestion({ id: "long0001" });
    const items = await gradeAll([first, second], { [second.id]: "x".repeat(9000) });
    expect(items.map((i) => i.score)).toEqual([0, 80]);
    expect(items[1].answer).toHaveLength(5000);
  });
});
