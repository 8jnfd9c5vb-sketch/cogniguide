import type { PublicQuestion, Question } from "./types";

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    question: q.question,
    subject: q.subject,
    materialId: q.materialId,
    language: q.language,
    level: q.level,
    origin: q.origin,
  };
}
