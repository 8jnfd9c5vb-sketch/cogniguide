import { describe, expect, it } from "vitest";
import { toPublicQuestion } from "@/lib/public";
import { PASS_SCORE } from "@/lib/scoring";
import { makeQuestion } from "./helpers";

describe("public questions", () => {
  it("drops the reference answer and the evidence", () => {
    const question = makeQuestion();
    expect(toPublicQuestion(question)).toEqual({
      id: question.id,
      question: question.question,
      subject: question.subject,
      materialId: question.materialId,
      language: question.language,
      level: question.level,
      origin: question.origin,
    });
    expect(PASS_SCORE).toBe(60);
  });
});
