import { describe, expect, it } from "vitest";
import { MathText } from "@/app/components/MathText";

type Span = { props: { dangerouslySetInnerHTML?: { __html: string } } };

function parts(text: string) {
  return MathText({ text }).props.children as Array<string | Span>;
}

describe("MathText", () => {
  it("renders inline and display math and keeps the surrounding text", () => {
    const children = parts("see $x^2$ and $$y+1$$.");
    expect(children[0]).toBe("see ");
    expect((children[1] as Span).props.dangerouslySetInnerHTML?.__html).toContain("katex");
    expect(children[2]).toBe(" and ");
    expect((children[3] as Span).props.dangerouslySetInnerHTML?.__html).toContain("katex-display");
    expect(children[4]).toBe(".");
  });

  it("accepts \\( \\) and \\[ \\] and does not throw on broken TeX", () => {
    const children = parts("\\(a\\) \\[b\\] $\\frac{$");
    expect(children.filter((part) => typeof part !== "string")).toHaveLength(3);
    expect(() => parts("$\\frac{$")).not.toThrow();
  });
});
