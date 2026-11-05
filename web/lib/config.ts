import fs from "node:fs";
import path from "node:path";

function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A profile may only change which models are called; storage and upload limits stay in .env.local. */
const PROFILE_KEYS = new Set([
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_BASE_URL",
  "VISION_MODEL",
  "CHAT_MODEL",
  "EMBEDDING_MODEL",
]);

export function parseProfile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (PROFILE_KEYS.has(key) && value) values[key] = value;
  }
  return values;
}

/**
 * MODEL_PROFILE selects web/profiles/<name>.env. A named-but-missing profile is an error
 * rather than a silent fall back to the cloud endpoint, because that would upload notes
 * to a provider the user thought they had switched off.
 */
function loadProfile(): { name: string; values: Record<string, string> } {
  const name = process.env.MODEL_PROFILE?.trim() ?? "";
  if (!name) return { name: "", values: {} };
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`MODEL_PROFILE "${name}" is invalid: use letters, digits, "-" or "_".`);
  }
  const file = path.join(process.cwd(), "profiles", `${name}.env`);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`MODEL_PROFILE is "${name}" but ${file} does not exist. Create it or clear MODEL_PROFILE.`);
  }
  return { name, values: parseProfile(text) };
}

const profile = loadProfile();

function setting(name: string, fallback: string): string {
  return profile.values[name] || process.env[name]?.trim() || fallback;
}

export const config = {
  dataDir: path.resolve(
    /*turbopackIgnore: true*/ process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data"),
  ),
  apiKey: setting("DASHSCOPE_API_KEY", ""),
  baseUrl: setting(
    "DASHSCOPE_BASE_URL",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ),
  visionModel: setting("VISION_MODEL", "qwen3-vl-plus"),
  chatModel: setting("CHAT_MODEL", "qwen-plus"),
  embeddingModel: setting("EMBEDDING_MODEL", "text-embedding-v4"),
  /** Active profile name, or "" when .env.local alone decides. */
  profile: profile.name,
  maxUploadMb: intEnv("MAX_UPLOAD_MB", 25),
  maxPdfPages: intEnv("MAX_PDF_PAGES", 50),
};

export const paths = {
  subjects: () => path.join(config.dataDir, "subjects"),
  subject: (slug: string) => path.join(config.dataDir, "subjects", slug),
  materials: (slug: string) => path.join(config.dataDir, "subjects", slug, "materials"),
  material: (slug: string, id: string) =>
    path.join(config.dataDir, "subjects", slug, "materials", id),
  attempts: () => path.join(config.dataDir, "attempts"),
  quizzes: () => path.join(config.dataDir, "quizzes"),
  mistakes: () => path.join(config.dataDir, "mistakes"),
  rag: () => path.join(config.dataDir, "rag"),
  ragIndexMeta: () => path.join(config.dataDir, "rag", "index.json"),
};

export const SUPPORTED_UPLOADS: Record<string, "pdf" | "image"> = {
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
};
