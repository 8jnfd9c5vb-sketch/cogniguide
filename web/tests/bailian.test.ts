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

  it("tells the model why its reply was rejected, so the retry can fix it", async () => {
    const copied = '{"questions":[{"question":"In question 16"}]}';
    chatCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: copied } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
    const value = await chatJson(
      "s",
      "u",
      (_raw, attempt) => {
        if (attempt === 0) throw new Error("refers to the notes");
        return { ok: true };
      },
      { feedback: (err) => `Fix this: ${err.message}` },
    );
    expect(value).toEqual({ ok: true });
    const retry = chatCreate.mock.calls[1][0].messages;
    expect(retry).toHaveLength(4);
    expect(retry[2]).toEqual({ role: "assistant", content: copied });
    expect(retry[3].content).toBe("Fix this: refers to the notes");
  });

  it("quotes the rejection when the caller supplies no feedback function", async () => {
    chatCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"a":1}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"a":2}' } }] });
    expect(
      await chatJson("s", "u", (_raw, attempt) => {
        if (attempt === 0) throw new Error("no questions array");
        return { good: true };
      }),
    ).toEqual({ good: true });
    expect(chatCreate.mock.calls[1][0].messages[3].content).toContain(
      "rejected: no questions array",
    );
  });

  it("honours the attempts and maxTokens options without changing the defaults", async () => {
    chatCreate.mockResolvedValue({ choices: [{ message: { content: "{}" } }] });
    expect(await chatJson("s", "u", (value) => value)).toEqual({});
    expect(chatCreate.mock.calls[0][0].max_tokens).toBeUndefined();

    await expect(
      chatJson("s", "u", () => {
        throw new Error("still wrong");
      }, { attempts: 3, maxTokens: 1500 }),
    ).rejects.toThrow(/still wrong/);
    expect(chatCreate).toHaveBeenCalledTimes(4);
    expect(chatCreate.mock.calls[3][0]).toMatchObject({ temperature: 0.2, max_tokens: 1500 });
  });
});
