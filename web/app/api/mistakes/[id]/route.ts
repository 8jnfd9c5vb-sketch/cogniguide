import { handle } from "@/lib/http";
import { deleteMistake } from "@/lib/storage";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/mistakes/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteMistake(id);
    return { ok: true };
  });
}
