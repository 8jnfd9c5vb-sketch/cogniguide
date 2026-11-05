import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { removeMaterial, UserError } from "@/lib/library";
import { getMaterial } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/subjects/[slug]/materials/[id]">,
) {
  return handle(async () => {
    const { slug, id } = await ctx.params;
    if (!(await getMaterial(slug, id))) throw new UserError("Material not found.", 404);
    await removeMaterial(slug, id);
    return { ok: true };
  });
}
