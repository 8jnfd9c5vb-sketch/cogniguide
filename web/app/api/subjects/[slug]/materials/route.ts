import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { uploadMaterial, UserError } from "@/lib/library";
import { getSubject, listMaterials } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/subjects/[slug]/materials">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    if (!(await getSubject(slug))) throw new UserError("Subject not found.", 404);
    return { materials: await listMaterials(slug) };
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/subjects/[slug]/materials">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new UserError("Choose a file to upload.");
    return { material: await uploadMaterial(slug, file) };
  });
}
