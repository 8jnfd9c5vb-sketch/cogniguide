import { handle } from "@/lib/http";
import { rebuildIndex } from "@/lib/jobs";

export async function POST() {
  return handle(async () => ({ queued: await rebuildIndex() }));
}
