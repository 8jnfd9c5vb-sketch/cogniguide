export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { resumePending } = await import("./lib/jobs");
  resumePending().catch((err) => console.error("[jobs] resume failed", err));
}
