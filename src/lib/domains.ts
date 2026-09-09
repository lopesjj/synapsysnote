
function trimOrigin(value: string | undefined): string {
  return value?.trim().replace(/\/$/, "") ?? "";
}

export const LOGIN_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_LOGIN_ORIGIN);
export const APP_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN);

export function isSplitHosts(): boolean {
  return Boolean(LOGIN_ORIGIN && APP_ORIGIN && LOGIN_ORIGIN !== APP_ORIGIN);
}

export function cookieParentDomain(): string | undefined {
  if (!isSplitHosts()) return undefined;
  try {
    const loginHost = new URL(LOGIN_ORIGIN).hostname;
    const appHost = new URL(APP_ORIGIN).hostname;
    if (appHost === loginHost) return undefined;
    if (appHost.endsWith(`.${loginHost}`)) return `.${loginHost}`;
    if (loginHost.endsWith(`.${appHost}`)) return `.${appHost}`;
  } catch {}
  return undefined;
}

export function loginHref(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return isSplitHosts() ? `${LOGIN_ORIGIN}${normalized}` : normalized;
}

export function appHref(path = "/home"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return isSplitHosts() ? `${APP_ORIGIN}${normalized}` : normalized;
}

export function resolveUrl(href: string, fallbackOrigin: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return new URL(href, fallbackOrigin).toString();
}

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

export function isAppHost(hostname = currentHostname()): boolean {
  if (!isSplitHosts()) return false;
  try {
    return hostname === new URL(APP_ORIGIN).hostname;
  } catch {
    return false;
  }
}

export function isLoginHost(hostname = currentHostname()): boolean {
  if (!isSplitHosts()) return true;
  try {
    return hostname === new URL(LOGIN_ORIGIN).hostname;
  } catch {
    return false;
  }
}

export function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function navigateTo(
  href: string,
  router?: { push: (path: string) => void; replace: (path: string) => void },
  mode: "push" | "replace" = "push"
) {
  if (typeof window === "undefined") return;
  const absolute = href.startsWith("http") ? href : new URL(href, window.location.origin).href;
  const url = new URL(absolute);
  if (url.origin !== window.location.origin) {
    if (mode === "replace") window.location.replace(absolute);
    else window.location.assign(absolute);
    return;
  }
  const local = `${url.pathname}${url.search}${url.hash}`;
  if (router) {
    router[mode](local);
    return;
  }
  if (mode === "replace") window.location.replace(local);
  else window.location.assign(local);
}
