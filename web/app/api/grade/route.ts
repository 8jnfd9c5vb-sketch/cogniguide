import type { NextRequest } from "next/server";
import { shortId } from "@/lib/fsutil";
import { handle } from "@/lib/http";
import { parseLevel } from "@/lib/levels";
import { recordMistakes, UserError } from "@/lib/library";
import { gradeAll } from "@/lib/quiz";
import { getQuestions, getQuiz, saveAttempt } from "@/lib/storage";
import type { Attempt, Question } from "@/lib/types";

interface GradeBody {
  mode?: "practice" | "quick";
  subject?: string;
  materialId?: string;
  quizId?: string;
  level?: string;
  answers?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as GradeBody;
    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

    let questions: Question[];
    let source: Attempt["source"];
    let mode: Attempt["mode"];
    if (body.mode === "quick") {
      const quiz = await getQuiz(body.quizId ?? "");
      if (!quiz) throw new UserError("This quiz has expired. Start a new one.", 404);
      questions = quiz.questions;
      source = { quizId: quiz.id };
      mode = quiz.kind ?? "quick";
    } else {
      questions = await getQuestions(body.subject ?? "", body.materialId ?? "", parseLevel(body.level));
      if (!questions.length) throw new UserError("No questions found for this material.", 404);
      // The practice page re-reads this cache, so answers keyed by a set that has since been rewritten
      // would all grade against the wrong question and land in the mistake log as 0.
      const answered = Object.keys(answers);
      const known = new Set(questions.map((q) => q.id));
      if (answered.length && answered.every((id) => !known.has(id))) {
        throw new UserError(
          "These questions have been rewritten for this level. Reload the page to answer the new set.",
          409,
        );
      }
      source = { subject: body.subject!, materialId: body.materialId! };
      mode = "practice";
    }

    const items = await gradeAll(questions, answers);
    await recordMistakes(questions, items);
    const attempt: Attempt = {
      id: shortId(),
      mode,
      source,
      createdAt: new Date().toISOString(),
      totalScore: Math.round(items.reduce((sum, i) => sum + i.score, 0) / Math.max(1, items.length)),
      items,
    };
    await saveAttempt(attempt);
    return { attempt };
  });
}
