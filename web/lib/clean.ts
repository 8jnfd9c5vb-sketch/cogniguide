/**
 * Strips workbook boilerplate and vision-model chatter from note text before it reaches a prompt.
 * Line based and fence aware: nothing inside a `$$ ... $$` display block is edited, because
 * removing text from LaTeX is more likely to corrupt the maths than to help.
 */

/** Cleaned chunks below this length carry no teachable content and are dropped from generation. */
export const MIN_USEFUL_CHUNK_CHARS = 60;

/** A display-math delimiter on its own line; chunkExtract always emits this form. */
const FENCE = /^\s*\$\$\s*$/;

/** Fill-in fields such as `Name ________________ Class ____( )`. */
const UNDERSCORE_RUN = /_{3,}/;
const NAME_LABEL = /\b(name|class|date|姓名|班別|班級|學號|学号)\b/i;

/** Course headers copied onto every page of a worksheet. */
const COURSE_HEADER = [
  /^(?:S[1-6]|F[1-6]|HKDSE|DSE)\b/,
  /^(?:secondary|junior form|senior form|form)\s*[1-6]\b/i,
  /^[A-Za-z0-9.&/ ]{0,30}?\b(?:chapter|ch\.?|unit|section|topic|worksheet|workbook|exercise|revision|textbook|工作紙|作業)\s*(?:no\.?\s*)?\d+/i,
];

/** Bare page marks, e.g. `P.3`, `Page 12`, `第 3 页`. */
const PAGE_MARK = [
  /^[Pp]\.?\s*\d{1,3}\s*[页頁]?$/,
  /^[Pp]age\s*\d{1,3}$/,
  /^\d{1,3}\s*[页頁]$/,
  /^第\s*\d{1,3}\s*[页頁]$/,
];

/** Anchored at the start of a line so `Actually` inside a `[Diagram: ...]` caption survives. */
const CHATTER = [
  /^(?:wait|hmm+|hm|oops|ok+|okay|alright)\b/i,
  /^actually\b/i,
  /^no\s*[-–—]\s/i,
  /^but\s+(?:as|again|looking|originally|per)\b/i,
  /^(?:as|but)\s+written\b/i,
  /^looking\s+again\b/i,
  /^i\s+(?:think|see|notice|believe|will|have)\b/i,
  /^(?:the\s+)?(?:printed|original)\s+(?:text|page|image|wording)\b/i,
  /^(?:correction|amendment)\b/i,
  /^per\s+(?:the\s+)?(?:instruction|request)\b/i,
  /^at\s+(?:the\s+)?(?:bottom|top|left|right|corner|middle|end)\b/i,
  /^(?:this|that|these)\s+pages?\b/i,
  /^(?:page|image|photo)\s*\d+\s+(?:is|shows|contains|has|appears)\b/i,
  /^(?:watermark|running\s+header|header|footer)\b/i,
  /^(?:illegible|blurry|unclear|faded|cut\s+off|missing|truncated)\b/i,
  /^(?:text|content)\s+(?:continues|resumes)\b/i,
  /^transcrib/i,
  /^identical\s+to\b/i,
  /^same\s+(?:as|diagram|figure|problem|question|page)\b/i,
  /^(?:duplicated?|repeated)\s+(?:problem|content|text|line)\b/i,
  /^appears\s+twice\b/i,
];

/** Bracketed asides the transcriber wrote about the page rather than about the maths. */
const BRACKET_META =
  /^\[\s*(?:note|same|identical|duplicat|transcri|text|illegible|unclear|watermark|cut|missing|page|editor|translator|correction|wait)/i;

/** Inline asides that sit inside an otherwise useful line. */
const INLINE_ASIDES = [
  /\s*\[\s*(?:nos?|questions?|qs?|exercises?|ex|problems?)\b\s*#?\s*[.:：]?\s*\d[^\]]*\]/gi,
  /\s*\[\s*note\s*[.:：][^\]]*\]/gi,
  /\s*[(（]\s*typo\b[^)）]*[)）]/gi,
];

/**
 * Item numbering, which points the model at the notes' own problems instead of at their method.
 * Bare numbers keep a lookahead so a decimal like `2.5 cm` survives; keyword forms need no guard.
 */
const NUMBER_PREFIX = [
  /^\s*\d{1,3}\s*[.)、）](?=\s|$)\s*/,
  /^\s*Q(?:uestion)?\s*#?\s*\d{1,3}\s*[.:：、)）]?\s*/i,
  /^\s*(?:Nos?\.?|No\.)\s*#?\s*\d{1,3}\s*[.:：、)）]?\s*/,
  /^\s*Ex(?:ercise)?\.?\s*\d{1,3}\s*[.:：、)）]?\s*/i,
  /^\s*(?:Example|Eg|例(?:題)?|範例)\s*\d{1,3}\s*[.:：、)）]?\s*/i,
  /^\s*(?:題|问题|問題)\s*\d{1,3}\s*[.:：、)）]?\s*/,
];

const underscoreCount = (line: string) => (line.match(/_/g) ?? []).length;

function isBoilerplate(line: string): boolean {
  const hasMath = line.includes("$");
  if (UNDERSCORE_RUN.test(line)) {
    const underscores = underscoreCount(line);
    if (underscores >= 5 && NAME_LABEL.test(line)) return true;
    if (!hasMath && underscores / line.length >= 0.3) return true;
  }
  if (hasMath) return false;
  return COURSE_HEADER.some((re) => re.test(line));
}

/** Removes junk from one chunk of non-fenced text, keeping at least one line of real content. */
function cleanLines(text: string): string {
  const kept: string[] = [];
  let inFence = false;
  for (const raw of text.split("\n")) {
    if (FENCE.test(raw)) {
      inFence = !inFence;
      kept.push(raw);
      continue;
    }
    if (inFence) {
      kept.push(raw);
      continue;
    }

    const declared = raw.trim();
    if (!declared) {
      kept.push("");
      continue;
    }
    if (isBoilerplate(declared) || PAGE_MARK.some((re) => re.test(declared))) continue;
    if (BRACKET_META.test(declared) || CHATTER.some((re) => re.test(declared))) continue;

    let line = declared;
    for (const re of INLINE_ASIDES) line = line.replace(re, "");
    for (const re of NUMBER_PREFIX) line = line.replace(re, "");
    line = line.trim();
    if (line) kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanChunkText(text: string): string {
  const input = text.trim();
  if (!input) return "";
  const cleaned = cleanLines(input);
  // A chunk of nothing but boilerplate really is useless, so an empty result stands. Otherwise, if the
  // rules removed almost everything, the text was not the junk we expect and the content wins.
  if (!cleaned || cleaned.length >= 0.2 * input.length) return cleaned;
  return input;
}
