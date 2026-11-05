import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bailian", () => ({
  transcribeImage: vi.fn(),
}));

import { transcribeImage } from "@/lib/bailian";
import { countPdfPages, extractText, ExtractionError } from "@/lib/extract";

const transcribe = vi.mocked(transcribeImage);

function pdf(pages: number): Buffer {
  const objects = [`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`];
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  objects.push(`2 0 obj\n<< /Type /Pages /Count ${pages} /Kids [${kids}] >>\nendobj\n`);
  for (let i = 0; i < pages; i++) {
    objects.push(`${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n`);
  }
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const start = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body + xref);
}

async function jpeg(width: number, height: number): Promise<string> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const dir = await mkdtemp(path.join(os.tmpdir(), "cogniguide-img-"));
  const file = path.join(dir, "page.jpg");
  await writeFile(file, await canvas.encode("jpeg"));
  return file;
}

beforeEach(() => {
  transcribe.mockReset();
});

describe("extractText", () => {
  it("normalises an image, strips a markdown fence and reports progress", async () => {
    transcribe.mockResolvedValue("```markdown\nHello $x$\n```");
    const seen: Array<[number, number]> = [];
    const text = await extractText(await jpeg(3000, 1000), "image", (page, total) => {
      seen.push([page, total]);
    });
    expect(text).toBe("## Page 1\n\nHello $x$\n");
    expect(seen).toEqual([[1, 1]]);
    const dataUrl = String(transcribe.mock.calls[0][0]);
    expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(String(transcribe.mock.calls[0][1])).toContain("[EMPTY]");
    const { loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    expect(img.width).toBe(2000);
    expect(img.height).toBe(667);
  });

  it("turns an empty page into an empty section", async () => {
    transcribe.mockResolvedValue("  [EMPTY]  ");
    const text = await extractText(await jpeg(20, 20), "image", () => {});
    expect(text).toBe("## Page 1\n");
  });

  it("retries a page three times and then reports it as failed", async () => {
    transcribe.mockRejectedValue(new Error("socket closed"));
    await expect(extractText(await jpeg(20, 20), "image", () => {})).rejects.toBeInstanceOf(ExtractionError);
    expect(transcribe).toHaveBeenCalledTimes(3);
  });

  it("transcribes each PDF page", async () => {
    const file = path.join(os.tmpdir(), `cogniguide-${Date.now()}.pdf`);
    await writeFile(file, pdf(2));
    expect(await countPdfPages(new Uint8Array(pdf(2)))).toBe(2);
    transcribe.mockResolvedValueOnce("Page one").mockResolvedValueOnce("[EMPTY]");
    const text = await extractText(file, "pdf", () => {});
    expect(text).toBe("## Page 1\n\nPage one\n\n## Page 2\n");
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
});
