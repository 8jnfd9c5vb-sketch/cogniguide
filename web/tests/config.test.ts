import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseProfile } from "@/lib/config";

describe("config", () => {
  it("falls back when numeric settings or model names are unusable", async () => {
    const saved = {
      MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB,
      MAX_PDF_PAGES: process.env.MAX_PDF_PAGES,
      VISION_MODEL: process.env.VISION_MODEL,
      CHAT_MODEL: process.env.CHAT_MODEL,
      DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL,
    };
    vi.resetModules();
    process.env.MAX_UPLOAD_MB = "0";
    process.env.MAX_PDF_PAGES = "many";
    process.env.VISION_MODEL = "  ";
    process.env.CHAT_MODEL = "";
    process.env.DASHSCOPE_BASE_URL = "";
    try {
      const { config, paths, SUPPORTED_UPLOADS } = await import("@/lib/config");
      expect(config.maxUploadMb).toBe(25);
      expect(config.maxPdfPages).toBe(50);
      expect(config.visionModel).toBe("qwen3-vl-plus");
      expect(config.chatModel).toBe("qwen-plus");
      expect(config.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
      expect(config.dataDir).toBe(path.resolve(process.env.DATA_DIR!));
      expect(paths.material("math", "abcd1234")).toBe(
        path.join(config.dataDir, "subjects", "math", "materials", "abcd1234"),
      );
      expect(paths.mistakes()).toBe(path.join(config.dataDir, "mistakes"));
      expect(SUPPORTED_UPLOADS).toMatchObject({ ".pdf": "pdf", ".jpeg": "image", ".webp": "image" });
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("model profiles", () => {
  it("reads model settings and nothing else", () => {
    expect(
      parseProfile(
        [
          "# comment",
          "",
          "DATA_DIR=/tmp/elsewhere",
          "MAX_UPLOAD_MB=999",
          "CHAT_MODEL = qwen3:4b ",
          "DASHSCOPE_API_KEY=sk-abc==",
          "not an assignment",
        ].join("\n"),
      ),
    ).toEqual({ CHAT_MODEL: "qwen3:4b", DASHSCOPE_API_KEY: "sk-abc==" });
  });

  it("ships a local profile that points at Ollama with all three models", () => {
    const local = parseProfile(fs.readFileSync(path.join(process.cwd(), "profiles/local.env"), "utf8"));
    expect(local.DASHSCOPE_BASE_URL).toBe("http://127.0.0.1:11434/v1");
    expect(local.DASHSCOPE_API_KEY).toBeTruthy();
    expect(local.VISION_MODEL).toBeTruthy();
    expect(local.CHAT_MODEL).toBeTruthy();
    expect(local.EMBEDDING_MODEL).toBeTruthy();
  });

  it("lets the profile override .env.local but keeps the key from it", async () => {
    vi.resetModules();
    process.env.MODEL_PROFILE = "cloud";
    process.env.VISION_MODEL = "overridden-by-profile";
    try {
      const { config } = await import("@/lib/config");
      expect(config.profile).toBe("cloud");
      expect(config.visionModel).toBe("qwen3-vl-plus");
      expect(config.embeddingModel).toBe("text-embedding-v4");
      expect(config.apiKey).toBe(process.env.DASHSCOPE_API_KEY);
    } finally {
      delete process.env.MODEL_PROFILE;
      delete process.env.VISION_MODEL;
    }
  });

  it("refuses to fall back to the cloud endpoint when the named profile is missing", async () => {
    vi.resetModules();
    process.env.MODEL_PROFILE = "no-such-profile";
    try {
      await expect(import("@/lib/config")).rejects.toThrow(/does not exist/);
    } finally {
      delete process.env.MODEL_PROFILE;
    }
  });
});
