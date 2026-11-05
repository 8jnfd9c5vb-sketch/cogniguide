import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { removeSubject, UserError } from "@/lib/library";
import { getSubject } from "@/lib/storage";

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/subjects/[slug]">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    if (!(await getSubject(slug))) throw new UserError("Subject not found.", 404);
    await removeSubject(slug);
    return { ok: true };
  });
}
