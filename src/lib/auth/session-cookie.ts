import "server-only";

import { cookies } from "next/headers";
import { REMEMBER_DAYS } from "@/lib/auth/remember";
import { sharedCookieOptions } from "@/lib/auth/cookie-options";

export const SESSION_COOKIE = "synapsys_session";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function sessionExpiresInMs(remember: boolean): number {
  return remember ? REMEMBER_DAYS * DAY_MS : 12 * HOUR_MS;
}

export async function setSessionCookie(value: string, remember: boolean) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, sharedCookieOptions(Math.floor(sessionExpiresInMs(remember) / 1000)));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", sharedCookieOptions(0));
}

export async function readSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function readSessionCookies(): Promise<string[]> {
  const jar = await cookies();
  return jar
    .getAll(SESSION_COOKIE)
    .map((cookie) => cookie.value)
    .filter(Boolean);
}
