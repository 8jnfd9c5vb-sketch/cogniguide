import { describe, expect, it } from "vitest";
import { MIN_USEFUL_CHUNK_CHARS, cleanChunkText } from "@/lib/clean";

describe("cleanChunkText", () => {
  it("drops workbook headers and answer-sheet fill-in fields", () => {
    const cleaned = cleanChunkText(
      [
        "S5 Math CP Chapter 9 Applications of Trigonometry in 2-dimensional Problems Name ________________ Class ____( ) 3",
        "By the sine formula, the ratio of sides equals the ratio of the opposite angles.",
        "姓名 ______________ 班別 ________",
      ].join("\n"),
    );
    expect(cleaned).toBe("By the sine formula, the ratio of sides equals the ratio of the opposite angles.");
  });

  it("drops a school-level header written out in full", () => {
    expect(
      cleanChunkText(
        [
          "Secondary 5 Mathematics Compulsory Part",
          "**Sine Formula**",
          "$$\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$$",
          "Form 3 Integrated Science",
        ].join("\n"),
      ),
    ).toBe("**Sine Formula**\n$$\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$$");
  });

  it("drops bare page marks", () => {
    expect(
      cleanChunkText("P.3\nThe cosine rule is $c^2 = a^2 + b^2 - 2ab\\cos C$.\nPage 12\n第 3 页"),
    ).toBe("The cosine rule is $c^2 = a^2 + b^2 - 2ab\\cos C$.");
  });

  it("removes item numbering and drops stems that held nothing but a number", () => {
    const cleaned = cleanChunkText(
      [
        "13.  ",
        "14.",
        "13. By the sine formula,",
        "16. $A = 25^\\circ$, $a = 11$ cm",
        "例 3：求 $\\sin A$。",
        "2.5 cm is the base.",
      ].join("\n"),
    );
    expect(cleaned.split("\n")).toEqual([
      "By the sine formula,",
      "$A = 25^\\circ$, $a = 11$ cm",
      "求 $\\sin A$。",
      "2.5 cm is the base.",
    ]);
  });

  it("removes a range reference but keeps the instruction it hangs off", () => {
    expect(
      cleanChunkText(
        "In each of the following, determine whether $\\triangle ABC$ can be formed. If yes, find $C$. [Nos. 16–19]",
      ),
    ).toBe(
      "In each of the following, determine whether $\\triangle ABC$ can be formed. If yes, find $C$.",
    );
  });

  it("drops vision-model chatter without touching real prose or captions", () => {
    const cleaned = cleanChunkText(
      [
        "Wait — correction from earlier part:",
        "Actually in original page, it says:",
        "But as written on page:",
        "No — looking again: the printed text says:",
        "At bottom right: P.1",
        "[Same diagram as above]",
        "[Note: The page contains repeated problems (e.g., 25 appears twice), but per instruction, transcribe exactly as written.]",
        "[Diagram: quadrilateral ABCD with AB = 3.5 cm, BC = ? Actually labelled as drawn]",
        "Note that $\\triangle PQR$ is an equilateral triangle.",
      ].join("\n"),
    );
    expect(cleaned).toBe(
      [
        "[Diagram: quadrilateral ABCD with AB = 3.5 cm, BC = ? Actually labelled as drawn]",
        "Note that $\\triangle PQR$ is an equilateral triangle.",
      ].join("\n"),
    );
  });

  it("removes an inline typo aside outside display math", () => {
    expect(cleanChunkText("Construct $EA$ such that $EA \\parallel CB$ (typo in the book).")).toBe(
      "Construct $EA$ such that $EA \\parallel CB$.",
    );
  });

  it("never edits inside a $$ fence", () => {
    const fenced = [
      "$$",
      "\\angle DAE + \\angle AED = 180^\\circ \\quad \\text{(typo? should be } \\angle ADE\\text{)}",
      "$$",
      "12. By the sine formula,",
    ].join("\n");
    expect(cleanChunkText(fenced)).toBe(fenced.replace("12. By", "By"));
  });

  it("collapses blank runs", () => {
    expect(cleanChunkText("P.1\n\n\n\n$\\sin B = 0.5$\n\n\n\n$B = 30^\\circ$")).toBe(
      "$\\sin B = 0.5$\n\n$B = 30^\\circ$",
    );
  });

  it("keeps content when the rules would gut a chunk, but empties a chunk that is all boilerplate", () => {
    const mostlyJunk = "P.1\nP.2\nP.3\nName ______________ Class ________\nYes.";
    expect(cleanChunkText(mostlyJunk)).toBe(mostlyJunk);
    expect(
      cleanChunkText(
        "P.1\nP.2\nName ______________ Class ________\nS5 Math CP Chapter 9 Revision Worksheet 2",
      ),
    ).toBe("");
  });

  it("trims and handles empty input", () => {
    expect(cleanChunkText("   \n  ")).toBe("");
    expect(cleanChunkText("  $x = 1$  ")).toBe("$x = 1$");
  });

  it("exports the usefulness threshold", () => {
    expect(MIN_USEFUL_CHUNK_CHARS).toBe(60);
  });

  it("cleans a real transcription down to its maths", () => {
    const fixture = [
      "S5 Math CP Chapter 9 Applications of Trigonometry in 2-dimensional Problems Name ________________ Class ____( ) 3",
      "",
      "13.  ",
      "14.  ",
      "15. $\\theta$ is obtuse.",
      "",
      "13. By the sine formula,  ",
      "$$",
      "\\frac{5\\ \\text{cm}}{\\sin B} = \\frac{\\sqrt{75}\\ \\text{cm}}{\\sin 120^\\circ}",
      "$$  ",
      "",
      "16. $A = 25^\\circ$, $a = 11$ cm, $c = 27$ cm",
      "",
      "In each of the following, determine whether $\\triangle ABC$ can be formed. If yes, find $C$. [Nos. 16–19]",
    ].join("\n");
    const cleaned = cleanChunkText(fixture);
    expect(cleaned).not.toContain("Chapter 9");
    expect(cleaned).not.toContain("Name");
    expect(cleaned).not.toContain("[Nos.");
    expect(cleaned).not.toMatch(/^\s*1[3456]\./m);
    expect(cleaned).toContain("\\sin B");
    expect(cleaned).toContain("$\\theta$ is obtuse.");
    expect(cleaned).toContain("$A = 25^\\circ$, $a = 11$ cm, $c = 27$ cm");
    expect(cleaned).toContain("determine whether $\\triangle ABC$ can be formed");
  });
});
