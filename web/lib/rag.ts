import { rm } from "node:fs/promises";
import * as lancedb from "@lancedb/lancedb";
import { embed } from "./bailian";
import { config, paths } from "./config";
import { readJson, writeJson } from "./fsutil";
import type { Chunk, SearchHit } from "./types";

const TABLE = "chunks";
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const ALL_ROWS = 1_000_000;

interface IndexMeta {
  model: string;
  dim: number;
  updatedAt: string;
}

interface Row {
  id: string;
  vector: number[];
  text: string;
  subject: string;
  material_id: string;
  file_name: string;
  chunk_index: number;
  page: number;
}

// Next.js may load this module more than once per process (instrumentation vs. routes),
// so the connection and the write lock live on globalThis.
const shared = globalThis as typeof globalThis & {
  __cogniRag?: { db: Promise<lancedb.Connection> | null; writeChain: Promise<unknown> };
};
const state = (shared.__cogniRag ??= { db: null, writeChain: Promise.resolve() });

function db(): Promise<lancedb.Connection> {
  state.db ??= lancedb.connect(paths.rag());
  return state.db;
}

async function openTable(): Promise<lancedb.Table | null> {
  const conn = await db();
  const names = await conn.tableNames();
  return names.includes(TABLE) ? conn.openTable(TABLE) : null;
}

/** Every write goes through this chain so that concurrent requests never interleave. */
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.writeChain.then(fn, fn);
  state.writeChain = run.catch(() => undefined);
  return run;
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

function toChunk(row: Record<string, unknown>): Chunk {
  return {
    id: String(row.id),
    text: String(row.text),
    subject: String(row.subject),
    materialId: String(row.material_id),
    fileName: String(row.file_name),
    chunkIndex: Number(row.chunk_index),
    page: Number(row.page),
  };
}

// ---------- index version ----------

export interface IndexState {
  indexedModel: string | null;
  configuredModel: string;
  mismatch: boolean;
}

export async function getIndexState(): Promise<IndexState> {
  const meta = await readJson<IndexMeta>(paths.ragIndexMeta());
  return {
    indexedModel: meta?.model ?? null,
    configuredModel: config.embeddingModel,
    mismatch: Boolean(meta && meta.model !== config.embeddingModel),
  };
}

export class IndexMismatchError extends Error {
  constructor(indexed: string) {
    super(
      `The search index was built with "${indexed}" but EMBEDDING_MODEL is "${config.embeddingModel}". Rebuild the index from the home page first.`,
    );
  }
}

async function assertIndexMatches(): Promise<void> {
  const state = await getIndexState();
  if (state.mismatch) throw new IndexMismatchError(state.indexedModel!);
}

// ---------- chunking ----------

/** Splits `## Page N` sections into overlapping chunks, preferring line or sentence breaks. */
export function chunkExtract(
  text: string,
  meta: { subject: string; materialId: string; fileName: string },
): Chunk[] {
  const pages: Array<{ page: number; body: string }> = [];
  const re = /^## Page (\d+)\s*$/gm;
  const marks = [...text.matchAll(re)];
  if (!marks.length) {
    pages.push({ page: 1, body: text });
  } else {
    marks.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index! : text.length;
      pages.push({ page: Number(m[1]), body: text.slice(start, end) });
    });
  }

  const chunks: Chunk[] = [];
  for (const { page, body } of pages) {
    const clean = body.trim();
    if (!clean) continue;
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + CHUNK_SIZE, clean.length);
      if (end < clean.length) {
        const window = clean.slice(start + CHUNK_SIZE / 2, end);
        const breakAt = Math.max(
          window.lastIndexOf("\n"),
          window.lastIndexOf(". "),
          window.lastIndexOf("。"),
        );
        if (breakAt > 0) end = start + CHUNK_SIZE / 2 + breakAt + 1;
      }
      const piece = clean.slice(start, end).trim();
      if (piece) {
        chunks.push({
          id: `${meta.materialId}-${chunks.length}`,
          text: piece,
          subject: meta.subject,
          materialId: meta.materialId,
          fileName: meta.fileName,
          chunkIndex: chunks.length,
          page,
        });
      }
      if (end >= clean.length) break;
      start = Math.max(end - CHUNK_OVERLAP, start + 1);
    }
  }
  return chunks;
}

// ---------- writes ----------

/** Replaces all vectors of one material. */
export async function indexChunks(materialId: string, chunks: Chunk[]): Promise<void> {
  await assertIndexMatches();
  const vectors = chunks.length ? await embed(chunks.map((c) => c.text)) : [];
  await withWriteLock(async () => {
    await assertIndexMatches();
    const meta = await readJson<IndexMeta>(paths.ragIndexMeta());
    const dim = vectors[0]?.length;
    if (meta && dim && meta.dim !== dim) {
      throw new Error(
        `Embedding dimension changed from ${meta.dim} to ${dim}. Rebuild the index from the home page.`,
      );
    }
    const rows: Row[] = chunks.map((c, i) => ({
      id: c.id,
      vector: vectors[i],
      text: c.text,
      subject: c.subject,
      material_id: c.materialId,
      file_name: c.fileName,
      chunk_index: c.chunkIndex,
      page: c.page,
    }));
    const table = await openTable();
    if (table) await table.delete(`material_id = ${quote(materialId)}`);
    if (!rows.length) return;
    if (table) await table.add(rows as unknown as Record<string, unknown>[]);
    else await (await db()).createTable(TABLE, rows as unknown as Record<string, unknown>[]);
    if (!meta) {
      await writeJson(paths.ragIndexMeta(), {
        model: config.embeddingModel,
        dim: dim!,
        updatedAt: new Date().toISOString(),
      } satisfies IndexMeta);
    }
  });
}

export async function deleteMaterialVectors(materialId: string): Promise<void> {
  await withWriteLock(async () => {
    const table = await openTable();
    if (table) await table.delete(`material_id = ${quote(materialId)}`);
  });
}

export async function deleteSubjectVectors(subject: string): Promise<void> {
  await withWriteLock(async () => {
    const table = await openTable();
    if (table) await table.delete(`subject = ${quote(subject)}`);
  });
}

/** Drops every vector and the model record so the index can be rebuilt with the current model. */
export async function resetIndex(): Promise<void> {
  await withWriteLock(async () => {
    const conn = await db();
    if ((await conn.tableNames()).includes(TABLE)) await conn.dropTable(TABLE);
    await rm(paths.ragIndexMeta(), { force: true });
  });
}

// ---------- reads ----------

/** Cosine distance above which a chunk is treated as unrelated to the query. */
const MAX_DISTANCE = 0.75;

export async function search(
  query: string,
  opts: { subject?: string; limit?: number } = {},
): Promise<SearchHit[]> {
  const table = await openTable();
  if (!table || !query.trim()) return [];
  await assertIndexMatches();
  const [vector] = await embed([query.trim()]);
  let q = table.vectorSearch(vector).distanceType("cosine").limit(opts.limit ?? 8);
  if (opts.subject) q = q.where(`subject = ${quote(opts.subject)}`);
  const rows = await q.toArray();
  return rows
    .map((r: Record<string, unknown>) => ({ ...toChunk(r), distance: Number(r._distance) }))
    .filter((hit: SearchHit) => hit.distance <= MAX_DISTANCE);
}

const META_COLUMNS = ["id", "text", "subject", "material_id", "file_name", "chunk_index", "page"];

export async function getChunks(ids: string[]): Promise<Chunk[]> {
  const table = await openTable();
  if (!table || !ids.length) return [];
  const rows = await table
    .query()
    .where(`id IN (${ids.map(quote).join(", ")})`)
    .select(META_COLUMNS)
    .limit(ids.length)
    .toArray();
  const byId = new Map(rows.map((r: Record<string, unknown>) => [String(r.id), toChunk(r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is Chunk => Boolean(c));
}

export async function materialChunks(materialId: string): Promise<Chunk[]> {
  const table = await openTable();
  if (!table) return [];
  const rows = await table
    .query()
    .where(`material_id = ${quote(materialId)}`)
    .select(META_COLUMNS)
    .limit(ALL_ROWS)
    .toArray();
  return rows.map(toChunk).sort((a: Chunk, b: Chunk) => a.chunkIndex - b.chunkIndex);
}

export async function sampleChunks(count: number, subject?: string): Promise<Chunk[]> {
  const table = await openTable();
  if (!table) return [];
  let q = table.query().select(["id"]).limit(ALL_ROWS);
  if (subject) q = q.where(`subject = ${quote(subject)}`);
  const ids = (await q.toArray()).map((r: Record<string, unknown>) => String(r.id));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return getChunks(ids.slice(0, count));
}

export async function chunkCountsBySubject(): Promise<Record<string, number>> {
  const table = await openTable();
  if (!table) return {};
  const rows = await table.query().select(["subject"]).limit(ALL_ROWS).toArray();
  const counts: Record<string, number> = {};
  for (const r of rows) counts[String(r.subject)] = (counts[String(r.subject)] ?? 0) + 1;
  return counts;
}
