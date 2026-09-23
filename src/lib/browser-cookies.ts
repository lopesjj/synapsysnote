import { cookieParentDomain } from "@/lib/domains";

/**
 * Cookies gravados pelo navegador. Em produção vão para o domínio pai, para o
 * login (apex) e o workspace (app.) enxergarem o mesmo valor.
 */
export function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const domain = cookieParentDomain();
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${maxAge}`,
    "samesite=lax",
  ];
  if (domain) parts.push(`domain=${domain}`);
  if (window.location.protocol === "https:") parts.push("secure");
  document.cookie = parts.join("; ");
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}
