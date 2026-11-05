import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/quiz", () => ({
  gradeAll: vi.fn(async (questions: Array<{ id: string; question: string; referenceAnswer: string; subject: string; materialId: string; chunkIds: string[] }>, answers: Record<string, string>) =>
    questions.map((q) => ({
      questionId: q.id,
      subject: q.subject,
      materialId: q.materialId,
      chunkIds: q.chunkIds,
      question: q.question,
      answer: answers[q.id] ?? "",
      referenceAnswer: q.referenceAnswer,
      score: 100,
      correctPoints: ["all of it"],
      missedPoints: [],
      feedback: "Well done.",
    })),
  ),
}));

import { POST as grade } from "@/app/api/grade/route";
import { DELETE as dropMistake } from "@/app/api/mistakes/[id]/route";
import { createSubject, getMistake, getSubject, saveMistake, saveQuestions } from "@/lib/storage";
import { gradeAll } from "@/lib/quiz";
import type { Mistake } from "@/lib/types";
import { makeQuestion } from "./helpers";

beforeEach(async () => {
  vi.mocked(gradeAll).mockClear();
  if (!(await getSubject("math"))) await createSubject("Math");
  await saveQuestions("math", "mat1", "s3", [makeQuestion({ id: "knownq01" })]);
});

function request(body: unknown) {
  return new Request("http://localhost/api/grade", {
    method: "POST",
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("POST /api/grade", () => {
  it("grades answers that match the cached set", async () => {
    const res = await grade(request({ subject: "math", materialId: "mat1", answers: { knownq01: "13 cm" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).attempt.totalScore).toBe(100);
  });

  it("refuses to grade a set the page never saw", async () => {
    const res = await grade(request({ subject: "math", materialId: "mat1", answers: { staleq01: "13 cm" } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("rewritten");
    expect(gradeAll).not.toHaveBeenCalled();
  });

  it("grades an empty answer sheet without the staleness check", async () => {
    const res = await grade(request({ subject: "math", materialId: "mat1", answers: {} }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/mistakes/[id]", () => {
  const mistake: Mistake = {
    id: "mistaken1",
    question: makeQuestion(),
    lastAnswer: "wrong",
    lastScore: 0,
    feedback: "Try again.",
    missedPoints: ["the square root step"],
    wrongCount: 1,
    firstWrongAt: new Date().toISOString(),
    lastWrongAt: new Date().toISOString(),
  };

  function remove(id: string) {
    return dropMistake(new Request("http://localhost/api/mistakes/x", { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
  }

  it("deletes a logged mistake", async () => {
    await saveMistake(mistake);
    expect((await remove("mistaken1")).status).toBe(200);
    expect(await getMistake("mistaken1")).toBeNull();
  });

  it("answers 404 for an id that is not logged", async () => {
    const res = await remove("ghostmist");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("not found");
  });
});
