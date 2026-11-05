import { describe, expect, it } from "vitest";
import { DEFAULT_LEVEL, LEVEL_GUIDANCE, LEVEL_LABELS, LEVELS, parseLevel } from "@/lib/levels";

describe("levels", () => {
  it("covers S1 to S6 with a label and guidance for each", () => {
    expect(LEVELS).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    for (const level of LEVELS) {
      expect(LEVEL_LABELS[level]).toMatch(/^S[1-6] · 中[一二三四五六]$/);
      expect(LEVEL_GUIDANCE[level].length).toBeGreaterThan(40);
    }
  });

  it("parses known levels and falls back to the default for anything else", () => {
    expect(parseLevel("s5")).toBe("s5");
    expect(DEFAULT_LEVEL).toBe("s3");
    for (const bad of ["S5", "s7", "", undefined, null, 3, {}]) {
      expect(parseLevel(bad)).toBe(DEFAULT_LEVEL);
    }
  });
});
