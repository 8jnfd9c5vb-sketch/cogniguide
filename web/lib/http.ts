import { NextResponse } from "next/server";
import { toUserMessage } from "./library";

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    const { message, status } = toUserMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
