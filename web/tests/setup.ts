import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Runs before each test file is imported: every file gets its own empty data directory
// and never reaches the real Bailian API.
const dataDir = mkdtempSync(path.join(os.tmpdir(), "cogniguide-test-"));
process.env.DATA_DIR = dataDir;
process.env.DASHSCOPE_API_KEY = "test-key";
process.env.EMBEDDING_MODEL = "test-embedding";

const shared = globalThis as Record<string, unknown>;
delete shared.__cogniRag;
delete shared.__cogniJobs;
delete shared.__cogniQuestionGen;

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
