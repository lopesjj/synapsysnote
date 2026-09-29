export const APP_NAME = "Synapsys Note";

export function formatTabTitle(pageName?: string | null): string {
  const name = pageName?.trim();
  if (!name) return APP_NAME;

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 7) {
    return `${APP_NAME} | ${words.slice(0, 7).join(" ")}...`;
  }

  return `${APP_NAME} | ${name}`;
}

let titlePrefix: string | null = null;
const prefixListeners = new Set<() => void>();

export function setTitlePrefix(value: string | null) {
  if (value === titlePrefix) return;
  titlePrefix = value;
  prefixListeners.forEach((listener) => listener());
}

export function subscribeTitlePrefix(listener: () => void): () => void {
  prefixListeners.add(listener);
  return () => {
    prefixListeners.delete(listener);
  };
}

export function withTitlePrefix(title: string): string {
  return titlePrefix ? `${titlePrefix} · ${title}` : title;
}
