import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { search } from "@/lib/rag";
import { isValidSlug } from "@/lib/storage";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = req.nextUrl.searchParams.get("q")?.slice(0, 500) ?? "";
    const subject = req.nextUrl.searchParams.get("subject") ?? "";
    const hits = await search(q, { subject: isValidSlug(subject) ? subject : undefined, limit: 8 });
    return { hits };
  });
}
