import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { buildReviewQuiz } from "@/lib/library";
import { toPublicQuestion } from "@/lib/public";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { subject?: string };
    const session = await buildReviewQuiz(body.subject || undefined);
    return { quizId: session.id, questions: session.questions.map(toPublicQuestion) };
  });
}
