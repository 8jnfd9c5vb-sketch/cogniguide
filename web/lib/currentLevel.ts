import { cookies } from "next/headers";
import { LEVEL_COOKIE, parseLevel, type Level } from "./levels";

export async function currentLevel(): Promise<Level> {
  return parseLevel((await cookies()).get(LEVEL_COOKIE)?.value);
}
