import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { enqueue } from "@/lib/jobs";
import { UserError } from "@/lib/library";
import { getMaterial, updateMaterial } from "@/lib/storage";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/subjects/[slug]/materials/[id]/retry">,
) {
  return handle(async () => {
    const { slug, id } = await ctx.params;
    const meta = await getMaterial(slug, id);
    if (!meta) throw new UserError("Material not found.", 404);
    if (meta.status !== "failed") throw new UserError("Only failed materials can be retried.");
    const material = await updateMaterial(slug, id, {
      status: "processing",
      step: "Queued",
      error: undefined,
      failedPages: undefined,
    });
    enqueue(slug, id);
    return { material };
  });
}
