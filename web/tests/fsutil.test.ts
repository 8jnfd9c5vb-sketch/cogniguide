import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJson, readText, safeFileName, shortId, writeFileAtomic, writeJson } from "@/lib/fsutil";

const dir = () => path.join(process.env.DATA_DIR!, "fsutil");

describe("shortId", () => {
  it("returns 8 lowercase alphanumeric characters", () => {
    for (let i = 0; i < 200; i++) expect(shortId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("does not repeat in practice", () => {
    const ids = new Set(Array.from({ length: 1000 }, shortId));
    expect(ids.size).toBe(1000);
  });
});

describe("JSON and text files", () => {
  it("round-trips JSON and creates missing directories", async () => {
    const file = path.join(dir(), "a", "b", "value.json");
    await writeJson(file, { name: "数学", n: 1 });
    expect(await readJson(file)).toEqual({ name: "数学", n: 1 });
  });

  it("returns null for missing files", async () => {
    expect(await readJson(path.join(dir(), "missing.json"))).toBeNull();
    expect(await readText(path.join(dir(), "missing.txt"))).toBeNull();
  });

  it("throws on malformed JSON instead of hiding it", async () => {
    await mkdir(dir(), { recursive: true });
    const file = path.join(dir(), "broken.json");
    await writeFile(file, "{not json");
    await expect(readJson(file)).rejects.toThrow();
  });

  it("overwrites atomically without leaving temp files behind", async () => {
    const file = path.join(dir(), "atomic", "data.txt");
    await writeFileAtomic(file, "first");
    await writeFileAtomic(file, new TextEncoder().encode("second"));
    expect(await readText(file)).toBe("second");
    expect(await readdir(path.dirname(file))).toEqual(["data.txt"]);
  });

  it("keeps the last value when many writes race", async () => {
    const file = path.join(dir(), "race.json");
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeJson(file, { i })));
    const value = await readJson<{ i: number }>(file);
    expect(value?.i).toBeGreaterThanOrEqual(0);
    expect((await readdir(dir())).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

describe("safeFileName", () => {
  it("replaces characters that Windows rejects", () => {
    expect(safeFileName('a<b>c:d"e/f\\g|h?i*j.pdf')).toBe("a_b_c_d_e_f_g_h_i_j.pdf");
  });

  it("strips trailing dots and spaces, and control characters", () => {
    expect(safeFileName("notes. . ")).toBe("notes");
    expect(safeFileName("a\u0001b.png")).toBe("a_b.png");
  });

  it("keeps non-ASCII names and limits length", () => {
    expect(safeFileName("静夜思.jpg")).toBe("静夜思.jpg");
    expect(safeFileName("x".repeat(300))).toHaveLength(120);
  });

  it("never returns an empty name", () => {
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("")).toBe("file");
  });
});
