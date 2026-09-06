import { cookieParentDomain } from "@/lib/domains";

export function sharedCookieOptions(maxAge: number) {
  const domain = cookieParentDomain();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {}),
  };
}
