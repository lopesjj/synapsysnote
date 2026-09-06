import { cookieParentDomain } from "@/lib/domains";

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function sharedCookieOptions(maxAge: number) {
  const domain = cookieParentDomain();
  return { ...baseCookieOptions(maxAge), ...(domain ? { domain } : {}) };
}
