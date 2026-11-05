import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { paths } from "./config";
import { readJson, readText, shortId, writeFileAtomic, writeJson } from "./fsutil";
import { DEFAULT_LEVEL, type Level } from "./levels";
import type {
  Attempt,
  MaterialKind,
  MaterialMeta,
  Mistake,
  Question,
  QuickQuizSession,
  QuizLanguage,
  Subject,
} from "./types";

const DEFAULT_SUBJECTS: Array<Pick<Subject, "slug" | "name" | "quizLanguage">> = [
  { slug: "chinese", name: "Chinese", quizLanguage: "zh" },
  { slug: "english", name: "English", quizLanguage: "en" },
  { slug: "math", name: "Math", quizLanguage: "en" },
  { slug: "geography", name: "Geography", quizLanguage: "en" },
];

let seeded: Promise<void> | null = null;

/** Seeds the default subjects only the first time the data directory is created. */
function ensureSeeded(): Promise<void> {
  seeded ??= (async () => {
    if (existsSync(paths.subjects())) return;
    const now = Date.now();
    for (const [i, s] of DEFAULT_SUBJECTS.entries()) {
      // Stagger timestamps so the list keeps this order.
      const createdAt = new Date(now + i).toISOString();
      await writeJson(path.join(paths.subject(s.slug), "subject.json"), { ...s, createdAt });
    }
  })().catch((err) => {
    seeded = null;
    throw err;
  });
  return seeded;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ID_RE = /^[a-z0-9]{4,16}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function isValidId(id: string): boolean {
  return ID_RE.test(id);
}

/** ASCII-only slugs keep folder names valid on Windows, macOS and Linux alike. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export async function listSubjects(): Promise<Subject[]> {
  await ensureSeeded();
  const entries = await readdir(paths.subjects(), { withFileTypes: true }).catch(() => []);
  const subjects: Subject[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subject = await readJson<Subject>(path.join(paths.subject(entry.name), "subject.json"));
    if (subject) subjects.push(subject);
  }
  return subjects.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
}

export async function getSubject(slug: string): Promise<Subject | null> {
  if (!isValidSlug(slug)) return null;
  await ensureSeeded();
  return readJson<Subject>(path.join(paths.subject(slug), "subject.json"));
}

export async function createSubject(name: string, quizLanguage: QuizLanguage = "en"): Promise<Subject> {
  await ensureSeeded();
  const displayName = name.trim().slice(0, 60);
  if (!displayName) throw new Error("Subject name is required.");
  const existing = await listSubjects();
  if (existing.some((s) => s.name.toLowerCase() === displayName.toLowerCase())) {
    throw new Error(`A subject named "${displayName}" already exists.`);
  }
  let slug = slugify(displayName) || `subject-${shortId()}`;
  if (existing.some((s) => s.slug === slug)) slug = `${slug.slice(0, 30)}-${shortId()}`;
  const subject: Subject = { slug, name: displayName, quizLanguage, createdAt: new Date().toISOString() };
  await writeJson(path.join(paths.subject(slug), "subject.json"), subject);
  return subject;
}

export async function deleteSubjectFiles(slug: string): Promise<void> {
  if (!isValidSlug(slug)) return;
  await rm(paths.subject(slug), { recursive: true, force: true });
}

// ---------- materials ----------

const metaFile = (slug: string, id: string) => path.join(paths.material(slug, id), "meta.json");

export function originalPath(meta: Pick<MaterialMeta, "subject" | "id" | "ext">): string {
  return path.join(paths.material(meta.subject, meta.id), `original${meta.ext}`);
}

export async function createMaterial(input: {
  subject: string;
  fileName: string;
  kind: MaterialKind;
  ext: string;
  data: Uint8Array;
  pages: number;
}): Promise<MaterialMeta> {
  const id = shortId();
  const now = new Date().toISOString();
  const meta: MaterialMeta = {
    id,
    subject: input.subject,
    fileName: input.fileName,
    kind: input.kind,
    ext: input.ext,
    sizeBytes: input.data.byteLength,
    pages: input.pages,
    status: "processing",
    step: "Queued",
    extracted: false,
    chunkCount: 0,
    questionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(paths.material(input.subject, id), { recursive: true });
  await writeFileAtomic(originalPath(meta), input.data);
  await writeJson(metaFile(input.subject, id), meta);
  return meta;
}

export async function getMaterial(slug: string, id: string): Promise<MaterialMeta | null> {
  if (!isValidSlug(slug) || !isValidId(id)) return null;
  return readJson<MaterialMeta>(metaFile(slug, id));
}

export async function listMaterials(slug: string): Promise<MaterialMeta[]> {
  if (!isValidSlug(slug)) return [];
  const entries = await readdir(paths.materials(slug), { withFileTypes: true }).catch(() => []);
  const items: MaterialMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readJson<MaterialMeta>(metaFile(slug, entry.name));
    if (meta) items.push(meta);
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllMaterials(): Promise<MaterialMeta[]> {
  const subjects = await listSubjects();
  const all = await Promise.all(subjects.map((s) => listMaterials(s.slug)));
  return all.flat();
}

/** Returns null when the material was deleted meanwhile. */
export async function updateMaterial(
  slug: string,
  id: string,
  patch: Partial<MaterialMeta>,
): Promise<MaterialMeta | null> {
  const current = await getMaterial(slug, id);
  if (!current) return null;
  const next: MaterialMeta = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await writeJson(metaFile(slug, id), next);
  return next;
}

export async function deleteMaterialFiles(slug: string, id: string): Promise<void> {
  if (!isValidSlug(slug) || !isValidId(id)) return;
  await rm(paths.material(slug, id), { recursive: true, force: true });
}

export async function readExtract(slug: string, id: string): Promise<string | null> {
  return readText(path.join(paths.material(slug, id), "extract.md"));
}

export async function writeExtract(slug: string, id: string, text: string): Promise<void> {
  await writeFileAtomic(path.join(paths.material(slug, id), "extract.md"), text);
}

const questionsFile = (slug: string, id: string, level: Level) =>
  path.join(paths.material(slug, id), `questions-${level}.json`);

export async function getQuestions(
  slug: string,
  id: string,
  level: Level = DEFAULT_LEVEL,
): Promise<Question[]> {
  if (!isValidSlug(slug) || !isValidId(id)) return [];
  const saved = await readJson<Question[]>(questionsFile(slug, id, level));
  if (saved) return saved;
  if (level !== DEFAULT_LEVEL) return [];
  // Materials processed before levels existed stored one set in questions.json.
  const legacy = await readJson<Question[]>(path.join(paths.material(slug, id), "questions.json"));
  return (legacy ?? []).map((q) => ({ ...q, level: DEFAULT_LEVEL }));
}

export async function saveQuestions(
  slug: string,
  id: string,
  level: Level,
  questions: Question[],
): Promise<void> {
  await writeJson(questionsFile(slug, id, level), questions);
}

// ---------- quick quiz sessions and attempts ----------

export async function saveQuiz(session: QuickQuizSession): Promise<void> {
  await writeJson(path.join(paths.quizzes(), `${session.id}.json`), session);
}

export async function getQuiz(id: string): Promise<QuickQuizSession | null> {
  if (!isValidId(id)) return null;
  return readJson<QuickQuizSession>(path.join(paths.quizzes(), `${id}.json`));
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  await writeJson(path.join(paths.attempts(), `${attempt.id}.json`), attempt);
}

// ---------- mistake log ----------

const mistakeFile = (id: string) => path.join(paths.mistakes(), `${id}.json`);

export async function getMistake(id: string): Promise<Mistake | null> {
  if (!isValidId(id)) return null;
  return readJson<Mistake>(mistakeFile(id));
}

export async function saveMistake(mistake: Mistake): Promise<void> {
  await writeJson(mistakeFile(mistake.id), mistake);
}

export async function deleteMistake(id: string): Promise<void> {
  if (!isValidId(id)) return;
  await rm(mistakeFile(id), { force: true });
}

/** Newest mistakes first. */
export async function listMistakes(): Promise<Mistake[]> {
  let names: string[];
  try {
    names = await readdir(paths.mistakes());
  } catch {
    return [];
  }
  const mistakes = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map((n) => readJson<Mistake>(path.join(paths.mistakes(), n))),
  );
  return mistakes
    .filter((m): m is Mistake => m !== null)
    .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt));
}
