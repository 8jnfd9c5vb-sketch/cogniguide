import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { LEVEL_COOKIE, parseLevel } from "@/lib/levels";
import { buildQuickQuiz } from "@/lib/library";
import { toPublicQuestion } from "@/lib/public";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { topic?: string; level?: string };
    const level = parseLevel(body.level ?? req.cookies.get(LEVEL_COOKIE)?.value);
    const session = await buildQuickQuiz(body.topic, level);
    return {
      quizId: session.id,
      topic: session.topic ?? null,
      level: session.level,
      questions: session.questions.map(toPublicQuestion),
    };
  });
}
