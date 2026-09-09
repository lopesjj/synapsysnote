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
