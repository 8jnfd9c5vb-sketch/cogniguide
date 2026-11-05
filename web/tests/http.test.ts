import { describe, expect, it } from "vitest";
import { handle } from "@/lib/http";
import { UserError } from "@/lib/library";

describe("handle", () => {
  it("returns the value as JSON", async () => {
    const res = await handle(async () => ({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns a user error into its status and hides the rest", async () => {
    const res = await handle(async () => {
      throw new UserError("This quiz has expired. Start a new one.", 404);
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This quiz has expired. Start a new one." });

    const crashed = await handle(async () => {
      throw new Error("ECONNRESET");
    });
    expect(crashed.status).toBe(500);
    expect((await crashed.json()).error).toContain("ECONNRESET");
  });
});
