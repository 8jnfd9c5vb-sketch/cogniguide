export const LEVELS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
export type Level = (typeof LEVELS)[number];

export const DEFAULT_LEVEL: Level = "s3";
export const LEVEL_COOKIE = "cogni-level";

export const LEVEL_LABELS: Record<Level, string> = {
  s1: "S1 · 中一",
  s2: "S2 · 中二",
  s3: "S3 · 中三",
  s4: "S4 · 中四",
  s5: "S5 · 中五",
  s6: "S6 · 中六",
};

export function parseLevel(value: unknown): Level {
  return LEVELS.includes(value as Level) ? (value as Level) : DEFAULT_LEVEL;
}

/** How each Hong Kong secondary year should shape question writing and grading. */
export const LEVEL_GUIDANCE: Record<Level, string> = {
  s1: "Secondary 1 (中一) in Hong Kong, age about 12, first year of junior secondary. Ask direct recall and basic understanding questions, one idea per question, plain vocabulary, and only simple single-step calculations.",
  s2: "Secondary 2 (中二) in Hong Kong, junior secondary. Ask about understanding and simple application in familiar situations, with at most two reasoning steps.",
  s3: "Secondary 3 (中三) in Hong Kong, the last year of junior secondary. Ask students to explain, compare and apply ideas in familiar situations, with short multi-step reasoning.",
  s4: "Secondary 4 (中四) in Hong Kong, first year of the HKDSE senior curriculum. Ask application questions that need several connected steps and correct subject terminology.",
  s5: "Secondary 5 (中五) in Hong Kong, HKDSE senior curriculum. Ask analysis questions that combine several ideas from the notes, need justification, and may use less familiar contexts.",
  s6: "Secondary 6 (中六) in Hong Kong, the HKDSE examination year. Ask exam-standard questions that require analysis, evaluation or rigorous derivation, precise terminology and well-structured answers.",
};
