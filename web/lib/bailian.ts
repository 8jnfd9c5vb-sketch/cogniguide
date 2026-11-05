import OpenAI from "openai";
import { config } from "./config";

let client: OpenAI | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super("DASHSCOPE_API_KEY is not set. Add it to web/.env.local and restart the server.");
  }
}

function getClient(): OpenAI {
  if (!config.apiKey) throw new MissingApiKeyError();
  client ??= new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 180_000,
    maxRetries: 2,
  });
  return client;
}

export function hasApiKey(): boolean {
  return Boolean(config.apiKey);
}

/** Transcribes one image (data URL) with the vision model. */
export async function transcribeImage(dataUrl: string, prompt: string): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: config.visionModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/** DashScope embedding endpoints accept at most 10 inputs per request. */
const EMBED_BATCH = 10;

export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await getClient().embeddings.create({
      model: config.embeddingModel,
      input: batch,
      encoding_format: "float",
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(item.embedding as number[]);
  }
  return out;
}

/**
 * Asks the chat model for a JSON object. Retries once when the reply
 * is not parseable or fails validation.
 */
export async function chatJson<T>(
  system: string,
  user: string,
  validate: (value: unknown) => T,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await getClient().chat.completions.create({
      model: config.chatModel,
      response_format: { type: "json_object" },
      temperature: attempt === 0 ? 0.4 : 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    try {
      return validate(JSON.parse(extractJson(raw)));
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`The model did not return valid JSON: ${(lastError as Error)?.message ?? lastError}`);
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
