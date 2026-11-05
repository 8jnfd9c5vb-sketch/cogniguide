import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { ensureQuestions } from "@/lib/jobs";
import { parseLevel } from "@/lib/levels";
import { UserError } from "@/lib/library";
import { toPublicQuestion } from "@/lib/public";
import { getMaterial } from "@/lib/storage";

/** Returns the questions for one level, generating and caching them the first time. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/subjects/[slug]/materials/[id]/questions">,
) {
  return handle(async () => {
    const { slug, id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { level?: string };
    const meta = await getMaterial(slug, id);
    if (!meta) throw new UserError("Material not found.", 404);
    if (meta.status !== "ready") throw new UserError("This material is not ready yet.");
    const questions = await ensureQuestions(slug, id, parseLevel(body.level));
    if (!questions.length) throw new UserError("No questions could be written for this material.");
    return { questions: questions.map(toPublicQuestion) };
  });
}
