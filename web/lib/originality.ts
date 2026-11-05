/**
 * Detects the two ways a generated question can fail to be its own problem: pointing at the notes,
 * or reusing their words. Returns a reason string (usable as retry feedback) or null when clean.
 */

/** The sharp signal: a question that asks about the notes instead of standing on its own. */
const SOURCE_REFERENCE = [
  /\b(?:question|questions|exercise|exercises|example|examples|problem|problems)\b\s*#?\s*\d{1,3}\b/i,
  /\b(?:no|nos|ex)\.\s*#?\s*\d{1,3}\b/i,
  /\bin\s+(?:the\s+|these\s+|your\s+)?(?:notes?|note|sources?|textbook|worked\s+solutions?)\b/i,
  /\bas\s+(?:in|shown|written|stated|given)\s+(?:the\s+|your\s+)?(?:notes?|source|textbook|book|example|figure|diagram)\b/i,
  /\b(?:same|identical|above|previous|earlier)\s+(?:diagram|figure|question|problem|triangle|page|values?)\b/i,
  /\b(?:given|stated|listed|shown)\s+on\s+page\s*\d+\b/i,
  /\bon\s+page\s*\d+\b/i,
  /第\s*\d+\s*[题題]/,
  /第\s*\d+\s*[页頁]/,
  /(?:笔记|筆記|资料|資料)\s*(?:中|里|上)/,
  /(?:如|按|根据|根據|参考|參考)\s*(?:上述|以上|原文|笔记|筆記)/,
  /上述|同上/,
];

const NUMERIC_WORD = /\d/;
const COMPUTATIONAL =
  /\b(?:find|calculate|compute|determine|solve|evaluate|show that|prove|work out|求|计算|計算|求证|求證|解答)\b/i;

/**
 * Measured on this corpus, a long run of instruction wording ("determine whether triangle abc can be
 * formed") is shared by new problems just as often as by copies, so only a run that carries one of
 * the notes' own values counts as copying.
 */
const MIN_SHARED_TOKENS = 8;
const CARRIES_A_VALUE = /\d/;

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function sharedRun(question: string, corpus: string): string | null {
  const source = new Set<string>();
  const corpusWords = words(corpus);
  for (let i = 0; i + MIN_SHARED_TOKENS <= corpusWords.length; i += 1) {
    const run = corpusWords.slice(i, i + MIN_SHARED_TOKENS).join(" ");
    if (CARRIES_A_VALUE.test(run)) source.add(run);
  }
  const asked = words(question);
  for (let i = 0; i + MIN_SHARED_TOKENS <= asked.length; i += 1) {
    const run = asked.slice(i, i + MIN_SHARED_TOKENS).join(" ");
    if (CARRIES_A_VALUE.test(run) && source.has(run)) return run;
  }
  return null;
}

/** True when the text asks the student to look at the notes rather than stating its own problem. */
export function pointsAtTheSource(text: string): string | null {
  for (const pattern of SOURCE_REFERENCE) {
    const match = text.match(pattern);
    if (match) return `refers to the notes ("${match[0].trim()}") instead of standing alone`;
  }
  return null;
}

/** Runs of `MIN_SHARED_TOKENS` words that reuse the notes' own values. */
export function quotesTheSource(question: string, corpus: string): string | null {
  const run = sharedRun(question, corpus);
  return run ? `copies the notes word for word ("${run}")` : null;
}

/** A numerical problem with no digits cannot be self-contained; prose subjects are left alone. */
export function lacksOwnGivens(question: string): string | null {
  return COMPUTATIONAL.test(question) && !NUMERIC_WORD.test(question)
    ? "asks for a calculation but states no values, so it depends on the notes"
    : null;
}

/** True when the question asks for a numerical result of its own, so its key must be checkable. */
export function looksNumerical(question: string): boolean {
  return COMPUTATIONAL.test(question) && NUMERIC_WORD.test(question);
}

const STEP_LINE = /^\s*(?:[-*>•]|\d{1,2}\s*[.)、]|(?:step|步骤|步驟)\s*\d+)/i;
const CONCLUSION_LINE =
  /^\s*(?:[-*>•]\s*)?(?:final\s+answer|answer|result|therefore|hence|so\b|∴|答案|最终答案|最後答案|所以|因此)/i;

/**
 * The reference answer has to be a markable key: at least three lines of working, then one line
 * stating the result. Numbered steps are what the prompt asks for, but three short lines of prose
 * working count as well - rejecting those is how a whole batch used to be thrown away over a
 * formatting preference.
 * `labels` is ordered: the prompt demands the first, the rest are tolerated.
 */
export function answerKeyShape(referenceAnswer: string, labels: string[]): string | null {
  const lines = referenceAnswer.split("\n").map((line) => line.trim()).filter(Boolean);
  const lastIndex = lines.length - 1;
  const steps = lines.filter((line) => STEP_LINE.test(line)).length;
  const working = lines.filter((line, i) => i < lastIndex || !CONCLUSION_LINE.test(line)).length;
  const statesResult =
    CONCLUSION_LINE.test(lines[lastIndex] ?? "") ||
    labels.some((label) => {
      const word = label.replace(/[:：\s]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (
        lines.some((line) => new RegExp(`^[-*>\\s]*${word}\\s*[:：]`, "i").test(line)) ||
        referenceAnswer.includes(label)
      );
    });
  const problems: string[] = [];
  if (steps < 3 && working < 3) {
    problems.push(`only ${Math.max(steps, working)} numbered step(s); needs at least 3`);
  }
  if (!statesResult) problems.push(`no "${labels[0]}" line`);
  return problems.length ? problems.join(", ") : null;
}
