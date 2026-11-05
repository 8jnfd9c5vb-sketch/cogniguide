import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { subjectSummaries, UserError } from "@/lib/library";
import { createSubject } from "@/lib/storage";

export async function GET() {
  return handle(async () => ({ subjects: await subjectSummaries() }));
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { name?: string; quizLanguage?: string };
    const quizLanguage = body.quizLanguage === "zh" ? "zh" : "en";
    try {
      return { subject: await createSubject(body.name ?? "", quizLanguage) };
    } catch (err) {
      throw new UserError(err instanceof Error ? err.message : String(err));
    }
  });
}
