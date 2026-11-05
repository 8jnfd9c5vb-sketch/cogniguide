import { handle } from "@/lib/http";
import { UserError } from "@/lib/library";
import { deleteMistake, getMistake } from "@/lib/storage";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/mistakes/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!(await getMistake(id))) throw new UserError("Mistake not found.", 404);
    await deleteMistake(id);
    return { ok: true };
  });
}
