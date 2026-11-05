import type { Chunk, Question } from "@/lib/types";

/** A reply item that passes every generation rule, so tests only override what they are about. */
export function makeGeneratedItem(
  overrides: Partial<{
    question: string;
    referenceAnswer: string;
    evidence: string;
    checks: string[];
    chunkIds: string[];
  }> = {},
) {
  return {
    question: "A right triangle has legs of 5 cm and 12 cm. Find the length of the hypotenuse.",
    referenceAnswer: [
      "1. Square each leg: 25 and 144.",
      "2. Add the squares: 169.",
      "3. Take the square root.",
      "Answer: 13 cm",
    ].join("\n"),
    evidence: "Pythagoras: the square on the hypotenuse equals the sum of the squares on the legs.",
    checks: ["5^2 + 12^2 = 169", "sqrt(169) = 13"],
    chunkIds: ["mat1-0"],
    ...overrides,
  };
}

export function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: "mat1-0",
    text: "A subspace is closed under addition and scalar multiplication.",
    subject: "math",
    materialId: "mat1",
    fileName: "notes.pdf",
    chunkIndex: 0,
    page: 1,
    ...overrides,
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1aaaaaa",
    question: "What is a subspace?",
    referenceAnswer: "A subset closed under addition and scalar multiplication.",
    evidence: "closed under addition and scalar multiplication",
    chunkIds: ["mat1-0"],
    subject: "math",
    materialId: "mat1",
    language: "en",
    level: "s3",
    origin: "notes",
    ...overrides,
  };
}
