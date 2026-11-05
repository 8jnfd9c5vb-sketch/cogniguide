import type { Chunk, Question } from "@/lib/types";

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
