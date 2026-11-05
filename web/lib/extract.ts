import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { transcribeImage } from "./bailian";
import type { MaterialKind } from "./types";

const LONG_EDGE_PX = 2000;
const JPEG_QUALITY = 85;
const PAGE_ATTEMPTS = 3;

const TRANSCRIBE_PROMPT = `Transcribe all study content on this page exactly as written, keeping its original language.
- Use Markdown. Write mathematics in LaTeX: $...$ inline, $$...$$ for display equations.
- Keep the order, item numbering and line breaks of the worked solutions themselves.
- Ignore watermarks, page numbers, running headers and footers, URLs, Telegram or social media links, and crossed-out text.
- Do not explain, summarise or add anything, and do not wrap the reply in a code block. Never comment on the page, the transcription itself or possible typos.
If the page contains no study content, reply with exactly: [EMPTY]`;

type PdfModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfModule> | null = null;

function pdfjs(): Promise<PdfModule> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

type PdfDocument = Awaited<ReturnType<PdfModule["getDocument"]>["promise"]>;

/** Opens a PDF, runs `fn`, and always releases the pdfjs worker afterwards. */
async function withPdf<T>(data: Uint8Array, fn: (doc: PdfDocument) => Promise<T>): Promise<T> {
  const lib = await pdfjs();
  // pdfjs takes ownership of the buffer, so hand it a copy.
  const task = lib.getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 });
  try {
    return await fn(await task.promise);
  } finally {
    await task.destroy();
  }
}

export async function countPdfPages(data: Uint8Array): Promise<number> {
  return withPdf(data, async (doc) => doc.numPages);
}

function toDataUrl(jpeg: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
}

async function renderPdfPage(doc: PdfDocument, pageNumber: number) {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = LONG_EDGE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return toDataUrl(await canvas.encode("jpeg", JPEG_QUALITY));
  } finally {
    page.cleanup();
  }
}

/** Re-encodes any supported image as a JPEG with a bounded long edge. */
async function normalizeImage(data: Uint8Array): Promise<string> {
  const img = await loadImage(Buffer.from(data));
  const scale = Math.min(1, LONG_EDGE_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return toDataUrl(await canvas.encode("jpeg", JPEG_QUALITY));
}

/** Vision models sometimes wrap the whole reply in ```markdown fences. */
function unwrapFence(text: string): string {
  const match = text.trim().match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```$/i);
  return (match ? match[1] : text).trim();
}

async function transcribeWithRetry(dataUrl: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt++) {
    try {
      const text = unwrapFence(await transcribeImage(dataUrl, TRANSCRIBE_PROMPT));
      return text === "[EMPTY]" ? "" : text;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly failedPages: number[],
  ) {
    super(message);
  }
}

/**
 * Transcribes a PDF or image page by page with the vision model.
 * Output is Markdown with a `## Page N` heading per page.
 */
export async function extractText(
  file: string,
  kind: MaterialKind,
  onProgress: (page: number, total: number) => Promise<void> | void,
): Promise<string> {
  const data = new Uint8Array(await readFile(file));
  const sections: string[] = [];
  const failedPages: number[] = [];
  let firstError: unknown;

  const handlePage = async (pageNumber: number, render: () => Promise<string>) => {
    try {
      const text = await transcribeWithRetry(await render());
      sections.push(`## Page ${pageNumber}\n\n${text}`.trim());
    } catch (err) {
      failedPages.push(pageNumber);
      firstError ??= err;
    }
  };

  if (kind === "image") {
    await onProgress(1, 1);
    await handlePage(1, () => normalizeImage(data));
  } else {
    await withPdf(data, async (doc) => {
      for (let n = 1; n <= doc.numPages; n++) {
        await onProgress(n, doc.numPages);
        await handlePage(n, () => renderPdfPage(doc, n));
      }
    });
  }

  if (failedPages.length) {
    const reason = firstError instanceof Error ? firstError.message : String(firstError);
    throw new ExtractionError(
      `Transcription failed on page ${failedPages.join(", ")}: ${reason}`,
      failedPages,
    );
  }
  return sections.join("\n\n") + "\n";
}
