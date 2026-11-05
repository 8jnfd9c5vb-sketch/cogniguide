import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { LEVEL_COOKIE, parseLevel } from "@/lib/levels";
import { buildSubjectQuiz } from "@/lib/library";
import { toPublicQuestion } from "@/lib/public";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/subjects/[slug]/quiz">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { level?: string };
    const level = parseLevel(body.level ?? req.cookies.get(LEVEL_COOKIE)?.value);
    const session = await buildSubjectQuiz(slug, level);
    return {
      quizId: session.id,
      level: session.level,
      fromNotes: session.questions.some((q) => q.origin !== "knowledge"),
      questions: session.questions.map(toPublicQuestion),
    };
  });
}
