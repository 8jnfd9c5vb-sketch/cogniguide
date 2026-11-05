/**
 * Checks the plain-ASCII equations an answer key claims, so a wrong number never reaches a student.
 * A local evaluator costs no tokens and cannot agree with the model's own arithmetic mistakes,
 * which is what a "please double-check your working" prompt would do.
 */

/** Trig takes and returns degrees, because that is how the notes (and Hong Kong syllabus) write it. */
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: (x) => Math.sin(toRadians(x)),
  cos: (x) => Math.cos(toRadians(x)),
  tan: (x) => Math.tan(toRadians(x)),
  asin: (x) => toDegrees(Math.asin(x)),
  acos: (x) => toDegrees(Math.acos(x)),
  atan: (x) => toDegrees(Math.atan(x)),
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: (x) => Math.log10(x),
  exp: Math.exp,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const OPERATORS = "+-*/^(),=";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isAlpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

type Token = { kind: "num" | "name" | "op"; text: string; value: number };

function tokenize(line: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (OPERATORS.includes(c)) {
      tokens.push({ kind: "op", text: c, value: 0 });
      i += 1;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(line[i + 1] ?? ""))) {
      let j = i;
      while (j < line.length && (isDigit(line[j]) || line[j] === ".")) j += 1;
      const text = line.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1) return `"${text}" is not a number`;
      const value = Number(text);
      if (!Number.isFinite(value)) return `"${text}" is not a number`;
      tokens.push({ kind: "num", text, value });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < line.length && (isAlpha(line[j]) || isDigit(line[j]) || line[j] === "_")) j += 1;
      const text = line.slice(i, j).toLowerCase();
      let call = j;
      while (call < line.length && /\s/.test(line[call])) call += 1;
      // Reject names here so `x + 1 = 2` or `11 cm` is reported as a name, not as a failed calculation.
      if (line[call] === "(") {
        if (!FUNCTIONS[text]) return `"${text}(" is not a supported function`;
      } else if (!(text in CONSTANTS)) {
        return `"${text}" is not a number (write only values, no variables or units)`;
      }
      tokens.push({ kind: "name", text, value: 0 });
      i = j;
      continue;
    }
    return `"${c}" is not an arithmetic character`;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private unclosed = false;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private take(text: string): boolean {
    if (this.peek()?.text === text) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  /** Returns the value, or NaN when the expression is malformed or leaves the real numbers. */
  parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      if (this.take("+")) value += this.parseTerm();
      else if (this.take("-")) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const next = this.peek();
      if (!next) return value;
      if (this.take("*")) value *= this.parseUnary();
      else if (this.take("/")) value /= this.parseUnary();
      else if (next.kind === "num" || next.kind === "name" || next.text === "(") {
        // Implicit multiplication: `13 sin(17)` and `2 (3 + 4)` are how the notes write it.
        value *= this.parseUnary();
      } else return value;
    }
  }

  private parseUnary(): number {
    if (this.take("-")) return -this.parseUnary();
    if (this.take("+")) return this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    return this.take("^") ? base ** this.parseUnary() : base;
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (!token) return Number.NaN;
    if (token.kind === "num") {
      this.pos += 1;
      return token.value;
    }
    if (token.kind === "name") {
      this.pos += 1;
      if (this.take("(")) {
        const fn = FUNCTIONS[token.text];
        if (!fn) return Number.NaN;
        const arg = this.parseExpression();
        if (!this.take(")")) {
          this.unclosed = true;
          return Number.NaN;
        }
        return fn(arg);
      }
      return CONSTANTS[token.text] ?? Number.NaN;
    }
    if (token.text === "(") {
      this.pos += 1;
      const value = this.parseExpression();
      if (!this.take(")")) {
        this.unclosed = true;
        return Number.NaN;
      }
      return value;
    }
    return Number.NaN;
  }

  get atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  /** True when the token stream was not consumed as one well-formed expression. */
  get invalid(): boolean {
    return this.unclosed || !this.atEnd;
  }
}

/**
 * How far apart the two sides may be: 1% for genuine arithmetic, plus the rounding the printed
 * decimal clearly carries (`12.7` stands for 12.65..12.75). Measured on real replies, a key that
 * rounds every intermediate to 4 significant figures lands 0.1-0.4% away from the exact value, while
 * a wrong setup is many percent away - so 1% accepts hand working and still rejects a wrong answer.
 */
function toleranceFor(line: string, value: number): number {
  const decimals = [...line.matchAll(/\d*\.(\d+)|\d+\./g)]
    .map((m) => (m[1] ?? "").length)
    .filter((d) => d > 0);
  const printed = decimals.length ? 0.5 * 10 ** -Math.min(...decimals) : 0;
  return Math.max(Math.abs(value) * 1e-2, printed, 1e-9);
}

/** `asin` in this checker already returns degrees, so a hand-made 180/pi conversion is the usual mistake. */
const convertedDegreesByHand = (side: string) =>
  /\b(?:asin|acos|atan)\b/i.test(side) && /\b180\b/.test(side) && /\bpi\b/.test(side);

/** Non-strict tests only have to survive floating-point noise, not the rounding in the key itself. */
const EPSILON = 1e-9;
const ORDERED: Record<string, (left: number, right: number) => boolean> = {
  "<": (left, right) => left < right,
  "<=": (left, right) => left <= right + EPSILON,
  ">": (left, right) => left > right,
  ">=": (left, right) => left >= right - EPSILON,
};

/** Reasons read as numbers the student would recognise, not 17-digit floats. */
const shown = (value: number) => String(Number(value.toPrecision(6)));

/**
 * Keys often annotate the rounding they just applied - "8.8863 = 8.89 (3 sig. fig.)". The note is prose
 * about the number, not part of the claim, so dropping it is what lets the line be checked at all.
 * Only a space-separated group that carries letters and no operators counts as a note, which leaves
 * calls like "sqrt(64)" and groups like "(3 + 4)" alone.
 */
const TRAILING_NOTE = /\s+\(\s*[^()]*[A-Za-z][^()]*\)\s*$/;

function dropTrailingNote(check: string): string {
  const note = check.match(TRAILING_NOTE);
  if (!note || /[+\-*/^=]/.test(note[0])) return check;
  return check.slice(0, note.index).trimEnd();
}

/** Every expression in a line, in order, with the relation that joins each neighbouring pair. */
function readLine(check: string) {
  const pieces = check.split(/\s*(<=|>=|<|>)\s*/);
  const values: number[] = [];
  const texts: string[] = [];
  const relations: string[] = [];
  const stop = (problem: string) => ({ values, texts, relations, problem });
  let pending = "=";
  for (const [index, piece] of pieces.entries()) {
    if (index % 2) {
      pending = piece;
      continue;
    }
    const parts = piece.split("=").map((part) => part.trim());
    if (parts.some((part) => !part)) return stop(`${check}: needs an expression on each side of the =`);
    for (const part of parts) {
      const tokens = tokenize(part);
      if (typeof tokens === "string") return stop(`${check}: ${tokens} in part ${values.length + 1}`);
      const parser = new Parser(tokens);
      const value = parser.parseExpression();
      if (parser.invalid) return stop(`${check}: part ${values.length + 1} is not a valid arithmetic expression`);
      if (values.length) relations.push(pending);
      pending = "=";
      values.push(value);
      texts.push(part);
    }
  }
  return values.length < 2 ? stop(`${check}: needs an expression on each side of the =`) : stop("");
}

/**
 * Returns one reason per check that is not a provable plain-ASCII statement; empty means every claim holds.
 * Non-ASCII is rejected outright, which keeps LaTeX out of the machine-readable field. A line may chain
 * equalities ("sin(110) = sin(70) = 0.9397") and end in a range test ("= 0.9397 < 1"); every neighbouring
 * pair has to agree.
 */
export function checkArithmetic(checks: string[]): string[] {
  const problems: string[] = [];
  for (const raw of checks) {
    const trimmed = raw.trim();
    if (!trimmed) {
      problems.push("empty check line");
      continue;
    }
    if (!/^[\x20-\x7E]+$/.test(trimmed)) {
      problems.push(`${trimmed}: must be plain ASCII arithmetic (no LaTeX or units)`);
      continue;
    }
    const check = dropTrailingNote(trimmed);
    const line = readLine(check);
    if (line.problem) {
      problems.push(line.problem);
      continue;
    }
    if (line.values.some((value) => !Number.isFinite(value))) {
      problems.push(`${check}: does not evaluate to a finite number`);
      continue;
    }
    for (let i = 1; i < line.values.length; i++) {
      const relation = line.relations[i - 1];
      const ordered = ORDERED[relation];
      if (ordered) {
        if (!ordered(line.values[i - 1], line.values[i])) {
          problems.push(
            `${check}: ${shown(line.values[i - 1])} ${relation} ${shown(line.values[i])} does not hold`,
          );
        }
        continue;
      }
      const gap = Math.abs(line.values[i - 1] - line.values[i]);
      if (gap <= toleranceFor(check, line.values[i])) continue;
      problems.push(
        convertedDegreesByHand(line.texts[i - 1])
          ? `${check}: inverse sine and cosine already give degrees here, so write asin(0.9559) = 72.9 and drop the 180/pi`
          : `${check}: the two sides differ by ${gap.toPrecision(3)}`,
      );
    }
  }
  return problems;
}
