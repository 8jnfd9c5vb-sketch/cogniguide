import katex from "katex";

/** Splits on $$...$$, \[...\], $...$ and \(...\); everything else stays plain text. */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;

function render(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex.trim(), { displayMode, throwOnError: false, strict: "ignore" });
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const display = m[1] ?? m[2];
    const html = display !== undefined ? render(display, true) : render(m[3] ?? m[4], false);
    parts.push(<span key={m.index} dangerouslySetInnerHTML={{ __html: html }} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={`whitespace-pre-wrap ${className ?? ""}`}>{parts}</span>;
}
