import { describe, expect, it } from "vitest";
import { checkArithmetic } from "@/lib/verify";

describe("checkArithmetic", () => {
  it("accepts the identities printed in the workbook", () => {
    const keys = [
      "27*sin(25)/11 = 1.0373",
      "7*sin(135)/2 = 2.4749",
      "asin(13*sin(17)/8) = 28.366",
      "asin(9*sin(74)/16) = 32.732",
      "asin(5*sin(120)/sqrt(75)) = 30",
      "asin(7.2*sin(58)/8.6) = 45.234",
      "11*sin(22.609)/sin(117) = 4.7461",
      "3.5^2 + 6^2 - 2*3.5*6*cos(60) = 27.25",
    ];
    expect(checkArithmetic(keys)).toEqual([]);
  });

  it("uses degrees, constants, powers, implicit multiplication and rounding", () => {
    expect(
      checkArithmetic([
        "sin(30) = 0.5",
        "cos(180) = -1",
        "2^10 = 1024",
        "13 sin(17) = 3.8008",
        "sqrt(75) = 8.6603",
        "12.7 = 4.7461 + 8",
        "e^1 = 2.718",
      ]),
    ).toEqual([]);
  });

  it("rejects arithmetic that is wrong", () => {
    expect(checkArithmetic(["27*sin(25)/11 = 1.4"])).toEqual([
      "27*sin(25)/11 = 1.4: the two sides differ by 0.363",
    ]);
    expect(checkArithmetic(["2 + 2 = 5"])).toHaveLength(1);
    expect(checkArithmetic(["sin(30) = 0.866"])).toHaveLength(1);
  });

  it("accepts a hand-worked key that rounds its intermediates", () => {
    expect(
      checkArithmetic([
        "6*sin(122)/15 = 0.3397",
        "13*sin(41)/9 = 0.9455",
        "14*sin(19)/5 = 0.9126",
        "asin(0.9455) = 71.0",
      ]),
    ).toEqual([]);
    expect(checkArithmetic(["6*sin(122)/15 = 0.36"])).toHaveLength(1);
  });

  it("names the degrees conversion the model reaches for", () => {
    const reasons = checkArithmetic(["asin(0.9559)*180/pi = 72.9"]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("already give degrees");
  });

  it("accepts a chained equality when every part agrees", () => {
    expect(checkArithmetic(["sin(110) = sin(70) = 0.9397", "2 = 2 = 2"])).toEqual([]);
    expect(checkArithmetic(["sin(110) = sin(70) = 0.342"])).toHaveLength(1);
  });

  it("reads an angle-sum or range test at the end of a check", () => {
    expect(
      checkArithmetic([
        "32 + 44.9 = 76.9 < 180",
        "27*sin(25)/11 = 1.0373 > 1",
        "14*sin(19)/5 = 0.9126 <= 1",
        "sin(30) < cos(30)",
        "1 >= 1",
      ]),
    ).toEqual([]);
    expect(checkArithmetic(["sin(30) = 0.5 > 1"])).toEqual(["sin(30) = 0.5 > 1: 0.5 > 1 does not hold"]);
    expect(checkArithmetic(["1 + 1 = 2 < 2"])).toHaveLength(1);
  });

  it("rejects anything that is not a plain-ASCII statement", () => {
    const reasons = checkArithmetic([
      "1 +",
      "\\sin C = 1.04",
      "2 = = 2",
      "asin(2) = 90",
      "11 cm = 11",
      "θ = 30",
      "",
      "5 * (3 + 2 = 25",
      "42",
    ]);
    expect(reasons).toHaveLength(9);
    expect(reasons[0]).toContain("expression on each side");
    expect(reasons[1]).toContain("not an arithmetic character");
    expect(reasons[2]).toContain("expression on each side");
    expect(reasons[3]).toContain("finite number");
    expect(reasons[4]).toContain('"cm" is not a number');
    expect(reasons[5]).toContain("plain ASCII");
    expect(reasons[6]).toBe("empty check line");
    expect(reasons[7]).toContain("not a valid arithmetic expression");
    expect(reasons[8]).toContain("expression on each side");
  });

  it("ignores the rounding note a key appends to a check", () => {
    expect(
      checkArithmetic([
        "8.8863 = 8.89 (3 sig. fig.)",
        "11*sin(22.609)/sin(117) = 4.7461 (correct to 4 d.p.)",
        "asin(0.5) = 30 (degrees)",
        "sqrt(64) = 8",
        "1 + 2 = (3)",
      ]),
    ).toEqual([]);
    expect(checkArithmetic(["8.8863 = 9.2 (3 sig. fig.)"])).toHaveLength(1);
  });

  it("returns one reason per bad check and keeps the good ones", () => {
    expect(checkArithmetic(["1 + 1 = 2", "1 + 1 = 3", "1 + 1 = 4"])).toHaveLength(2);
  });
});
