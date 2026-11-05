import { describe, expect, it } from "vitest";
import {
  answerKeyShape,
  lacksOwnGivens,
  looksNumerical,
  pointsAtTheSource,
  quotesTheSource,
} from "@/lib/originality";

const COPIED_FROM_NOTES = [
  "In question 13, the sine formula is used to find angle $B$, and then the angle sum of a triangle gives $\\theta = 30^\\circ$. Explain why $\\theta$ is obtuse.",
  "In question 14, $\\sin B \\approx 0.8517$, giving $B \\approx 45.234^\\circ$. Why is the ambiguous case rejected?",
  "In question 15, solving $\\sin A = \\frac{13 \\sin 17^\\circ}{8}$ gives $A \\approx 28.366^\\circ$. Show the full calculation.",
  "In question 16, $\\sin C \\approx 1.04 > 1$. Explain why this means triangle $ABC$ cannot be formed.",
  "In question 18, $\\sin C \\approx 2.47$. Compare this situation with question 16 and explain what conclusion can be drawn.",
];

const NEW_PROBLEM =
  "Triangle $ABC$ has $A = 32^\\circ$, $a = 9$ cm and $c = 14$ cm. Find the two possible values of $C$, correct to 3 significant figures.";

const ANSWER_KEY = [
  "1. By the sine formula, $\\frac{9}{\\sin 32^\\circ} = \\frac{14}{\\sin C}$.",
  "2. So $\\sin C = \\frac{14 \\sin 32^\\circ}{9} = 0.8213$.",
  "3. $C = 55.2^\\circ$, and the ambiguous case gives $C = 180^\\circ - 55.2^\\circ = 124.8^\\circ$.",
  "4. Both are valid since $A + C < 180^\\circ$ in each case.",
  "Answer: $C = 55.2^\\circ$ or $C = 124.8^\\circ$",
].join("\n");

describe("pointsAtTheSource", () => {
  it("rejects every question copied from this workbook, in English", () => {
    for (const question of COPIED_FROM_NOTES) {
      expect(pointsAtTheSource(question)).toContain("refers to the notes");
    }
  });

  it("rejects references to the notes in Chinese", () => {
    expect(pointsAtTheSource("如笔记中第 16 题所示，判断三角形能否构成。")).toContain("refers to the notes");
    expect(pointsAtTheSource("求第 3 页例 2 的面积。")).not.toBeNull();
  });

  it("accepts a problem that states its own givens", () => {
    expect(pointsAtTheSource(NEW_PROBLEM)).toBeNull();
    expect(pointsAtTheSource("State the sine formula and explain when it can be used.")).toBeNull();
  });

  it("flags a shared diagram or page reference", () => {
    expect(pointsAtTheSource("Use the same diagram as above to find $AE$.")).not.toBeNull();
    expect(pointsAtTheSource("Find the area given on page 4.")).not.toBeNull();
  });
});

describe("quotesTheSource", () => {
  const corpus =
    "In each of the following, determine whether triangle ABC can be formed. If yes, find C. In triangle ABC, A = 25, a = 11 cm and c = 27 cm, so sin C equals 27 sin 25 divided by 11.";

  it("catches a run that carries the notes' own values", () => {
    expect(quotesTheSource("In triangle ABC, A = 25, a = 11 cm and c = 27 cm. Find C.", corpus)).toContain(
      "copies the notes word for word",
    );
  });

  it("does not fire on instruction wording a new problem also uses", () => {
    expect(quotesTheSource("Determine whether triangle ABC can be formed. If yes, find C.", corpus)).toBeNull();
    expect(
      quotesTheSource(
        "In triangle PQR, angle P = 42, p = QR = 14 cm and q = PR = 9 cm. Determine whether the triangle can be formed and, if yes, find R.",
        corpus,
      ),
    ).toBeNull();
  });

  it("lets a paraphrase through", () => {
    expect(quotesTheSource("Can a triangle ABC exist with these measurements?", corpus)).toBeNull();
  });

  it("needs a long run before it fires", () => {
    expect(quotesTheSource("Find C using the sine formula, sin C equals 27 sin 25.", corpus)).toBeNull();
  });
});

describe("lacksOwnGivens", () => {
  it("rejects a calculation with no values of its own", () => {
    expect(lacksOwnGivens("Find the value of $\\theta$.")).toContain("states no values");
  });

  it("accepts a numerical question that carries its data", () => {
    expect(lacksOwnGivens(NEW_PROBLEM)).toBeNull();
  });

  it("leaves prose subjects alone", () => {
    expect(lacksOwnGivens("Explain why the ambiguous case arises in the sine formula.")).toBeNull();
  });

  it("tells a numerical question from a prose one", () => {
    expect(looksNumerical(NEW_PROBLEM)).toBe(true);
    expect(looksNumerical("Explain why the ambiguous case arises in the sine formula.")).toBe(false);
  });
});

describe("answerKeyShape", () => {
  const EN = ["Answer:", "答案："];
  const ZH = ["答案：", "Answer:"];

  it("accepts a numbered mark scheme with a labelled result", () => {
    expect(answerKeyShape(ANSWER_KEY, EN)).toBeNull();
  });

  it("rejects the one-sentence keys the old sets are full of", () => {
    const reason = answerKeyShape(
      "Since the sine of any real angle must satisfy $-1 \\leq \\sin x \\leq 1$, a value of $\\sin C = 1.04$ is impossible.",
      EN,
    );
    expect(reason).toContain("numbered step");
    expect(reason).toContain("Answer:");
  });

  it("accepts a Chinese key with its own label", () => {
    const key = ["1. 由正弦公式，$\\frac{9}{\\sin 32^\\circ} = \\frac{14}{\\sin C}$。", "2. $\\sin C = 0.8213$。", "3. $C = 55.2^\\circ$。", "答案：$C = 55.2^\\circ$"].join("\n");
    expect(answerKeyShape(key, ZH)).toBeNull();
    expect(answerKeyShape("因为正弦值不能大于 1，所以无解。", ZH)).toContain("答案：");
  });

  it("accepts any recognised conclusion line, whichever language's label it uses", () => {
    expect(answerKeyShape(ANSWER_KEY, ["答案："])).toBeNull();
    const noResult = [
      "1. By the sine formula, $\\frac{9}{\\sin 32^\\circ} = \\frac{14}{\\sin C}$.",
      "2. $\\sin C = 0.8213$.",
      "3. $C = 55.2^\\circ$ or $124.8^\\circ$.",
    ].join("\n");
    expect(answerKeyShape(noResult, ["答案："])).toContain("答案：");
  });

  it("accepts prose working that runs to three lines before the result", () => {
    const prose = [
      "The sine ratio gives the angle opposite the longer side first.",
      "Because the given angle is acute, the ambiguous case has to be tested.",
      "The second angle is the supplement, and it still leaves a positive third angle.",
      "Therefore both triangles exist.",
    ].join("\n");
    expect(answerKeyShape(prose, EN)).toBeNull();
    expect(answerKeyShape("The two angles are supplementary.", EN)).toContain("numbered step");
  });
});
