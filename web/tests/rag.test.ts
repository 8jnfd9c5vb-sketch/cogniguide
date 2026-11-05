import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Chunk } from "@/lib/types";

vi.mock("@/lib/bailian", () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(vectorFor)),
}));

import {
  chunkCountsBySubject,
  chunkExtract,
  deleteMaterialVectors,
  deleteSubjectVectors,
  getChunks,
  getIndexState,
  indexChunks,
  IndexMismatchError,
  materialChunks,
  resetIndex,
  sampleChunks,
  search,
} from "@/lib/rag";

function vectorFor(text: string): number[] {
  if (text.includes("subspace")) return [1, 0];
  if (text.includes("poem")) return [0, 1];
  return [0.2, 0.2];
}

function chunk(overrides: Partial<Chunk>): Chunk {
  return {
    id: "m-0",
    text: "A subspace is closed.",
    subject: "math",
    materialId: "matone",
    fileName: "notes.pdf",
    chunkIndex: 0,
    page: 1,
    ...overrides,
  };
}

describe("chunkExtract", () => {
  it("splits pages, skips empty ones and keeps ids in order", () => {
    const text = ["## Page 1", "", "First page.", "", "## Page 2", "", "   ", "", "## Page 4", "", "Fourth."].join(
      "\n",
    );
    const chunks = chunkExtract(text, { subject: "math", materialId: "mat", fileName: "n.pdf" });
    expect(chunks.map((c) => [c.page, c.text, c.id])).toEqual([
      [1, "First page.", "mat-0"],
      [4, "Fourth.", "mat-1"],
    ]);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("treats text without page headings as page 1", () => {
    const chunks = chunkExtract("Just a paragraph.", {
      subject: "english",
      materialId: "eng",
      fileName: "n.png",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ page: 1, id: "eng-0" });
  });

  it("breaks long pages on a line boundary and overlaps the next chunk", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Line ${String(i).padStart(2, "0")} talks about subspaces.`);
    const chunks = chunkExtract(`## Page 1\n\n${lines.join("\n")}`, {
      subject: "math",
      materialId: "long",
      fileName: "n.pdf",
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.endsWith(".")).toBe(true);
    const endOfFirst = chunks[0].text.slice(-40);
    expect(chunks[1].text.includes(endOfFirst.trim().split("\n").pop()!)).toBe(true);
    expect(chunks.every((c) => c.text.length <= 800)).toBe(true);
  });
});

describe("vector index", () => {
  beforeEach(async () => {
    config.embeddingModel = "test-embedding";
    await resetIndex();
  });

  const math = [
    chunk({ id: "matone-0", text: "A subspace is closed under addition.", chunkIndex: 0 }),
    chunk({ id: "matone-1", text: "A subspace is closed under scaling.", chunkIndex: 1, page: 2 }),
  ];
  const chinese = [
    chunk({
      id: "poem1-0",
      text: "The poem is about moonlight.",
      subject: "chinese",
      materialId: "poem1",
      fileName: "poem.png",
    }),
  ];

  it("starts empty and records the embedding model on first write", async () => {
    expect(await getIndexState()).toMatchObject({ indexedModel: null, mismatch: false });
    expect(await search("subspace")).toEqual([]);
    await indexChunks("matone", math);
    expect(await getIndexState()).toMatchObject({ indexedModel: "test-embedding", mismatch: false });
  });

  it("finds nearby chunks, drops unrelated ones and can filter by subject", async () => {
    await indexChunks("matone", math);
    await indexChunks("poem1", chinese);
    const hits = await search("subspace definition");
    expect(hits.map((h) => h.id).sort()).toEqual(["matone-0", "matone-1"]);
    expect(hits.every((h) => h.distance <= 0.75)).toBe(true);
    expect(await search("subspace", { subject: "chinese" })).toEqual([]);
    expect(await search("   ")).toEqual([]);
  });

  it("replaces a material's rows instead of appending them", async () => {
    await indexChunks("matone", math);
    await indexChunks("matone", [chunk({ id: "matone-9", text: "A subspace rewritten." })]);
    expect((await materialChunks("matone")).map((c) => c.id)).toEqual(["matone-9"]);
  });

  it("returns chunks in the requested order and in page order for a material", async () => {
    await indexChunks("matone", math);
    expect((await getChunks(["matone-1", "missing", "matone-0"])).map((c) => c.id)).toEqual([
      "matone-1",
      "matone-0",
    ]);
    expect(await getChunks([])).toEqual([]);
    expect((await materialChunks("matone")).map((c) => c.chunkIndex)).toEqual([0, 1]);
  });

  it("samples within one subject and counts rows per subject", async () => {
    await indexChunks("matone", math);
    await indexChunks("poem1", chinese);
    const sample = await sampleChunks(5, "math");
    expect(sample.length).toBe(2);
    expect(sample.every((c) => c.subject === "math")).toBe(true);
    expect(await chunkCountsBySubject()).toEqual({ math: 2, chinese: 1 });
  });

  it("deletes one material or one subject, including ids that contain quotes", async () => {
    const quoted = chunk({ id: "o'b-0", materialId: "o'b", text: "A subspace named o'b." });
    await indexChunks("o'b", [quoted]);
    await indexChunks("matone", math);
    await indexChunks("poem1", chinese);
    await deleteMaterialVectors("o'b");
    expect(await materialChunks("o'b")).toEqual([]);
    await deleteSubjectVectors("math");
    expect(await chunkCountsBySubject()).toEqual({ chinese: 1 });
  });

  it("refuses to search or write when the embedding model changed", async () => {
    await indexChunks("matone", math);
    config.embeddingModel = "other-model";
    expect((await getIndexState()).mismatch).toBe(true);
    await expect(search("subspace")).rejects.toBeInstanceOf(IndexMismatchError);
    await expect(indexChunks("poem1", chinese)).rejects.toBeInstanceOf(IndexMismatchError);
    config.embeddingModel = "test-embedding";
  });

  it("refuses vectors whose dimension differs from the index", async () => {
    await indexChunks("matone", math);
    const { embed } = await import("@/lib/bailian");
    vi.mocked(embed).mockResolvedValueOnce([[1, 0, 0]]);
    await expect(indexChunks("poem1", chinese)).rejects.toThrow(/dimension changed/);
  });

  it("resets the index so it can be rebuilt with another model", async () => {
    await indexChunks("matone", math);
    await resetIndex();
    expect(await materialChunks("matone")).toEqual([]);
    expect((await getIndexState()).indexedModel).toBeNull();
  });
});
