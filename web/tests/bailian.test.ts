import { beforeEach, describe, expect, it, vi } from "vitest";

const chatCreate = vi.hoisted(() => vi.fn());
const embedCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: chatCreate } };
    embeddings = { create: embedCreate };
  },
}));

import { chatJson, embed, hasApiKey, MissingApiKeyError, transcribeImage } from "@/lib/bailian";
import { config } from "@/lib/config";

beforeEach(() => {
  chatCreate.mockReset();
  embedCreate.mockReset();
  config.apiKey = "test-key";
});

describe("bailian client", () => {
  it("refuses to call the API without a key", async () => {
    config.apiKey = "";
    expect(hasApiKey()).toBe(false);
    await expect(transcribeImage("data:image/jpeg;base64,aa", "prompt")).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("sends the image and prompt to the vision model", async () => {
    chatCreate.mockResolvedValue({ choices: [{ message: { content: "  hello  " } }] });
    expect(await transcribeImage("data:image/jpeg;base64,aa", "transcribe")).toBe("hello");
    expect(chatCreate.mock.calls[0][0]).toMatchObject({
      model: config.visionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,aa" } },
            { type: "text", text: "transcribe" },
          ],
        },
      ],
    });
  });

  it("embeds in batches of 10 and restores the original order", async () => {
    embedCreate.mockImplementation(async ({ input }: { input: string[] }) => ({
      data: input
        .map((text, index) => ({ index, embedding: [text.length] }))
        .reverse(),
    }));
    const texts = Array.from({ length: 11 }, (_, i) => "x".repeat(i + 1));
    expect(await embed(texts)).toEqual(texts.map((text) => [text.length]));
    expect(embedCreate).toHaveBeenCalledTimes(2);
    expect(embedCreate.mock.calls[0][0].input).toHaveLength(10);
    expect(embedCreate.mock.calls[1][0].input).toHaveLength(1);
    expect(embedCreate.mock.calls[0][0].encoding_format).toBe("float");
    expect(embedCreate.mock.calls[0][0].model).toBe(config.embeddingModel);
  });

  it("extracts fenced JSON and retries once when validation fails", async () => {
    chatCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":false}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Sure ```json\n{"ok":true}\n```' } }] });
    let attempts = 0;
    const value = await chatJson("system", "user", (raw) => {
      attempts++;
      const record = raw as { ok?: boolean };
      if (!record.ok) throw new Error("missing ok");
      return record;
    });
    expect(value).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(chatCreate.mock.calls[0][0].temperature).toBe(0.4);
    expect(chatCreate.mock.calls[1][0].temperature).toBe(0.2);
    expect(chatCreate.mock.calls[0][0].response_format).toEqual({ type: "json_object" });
  });

  it("gives up after two unusable replies", async () => {
    chatCreate.mockResolvedValue({ choices: [{ message: { content: '{"x":1}' } }] });
    await expect(chatJson("s", "u", () => {
      throw new Error("bad shape");
    })).rejects.toThrow(/bad shape/);
    expect(chatCreate).toHaveBeenCalledTimes(2);
  });
});
