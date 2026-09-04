export const APP_NAME = "Synapsys Note";

export function formatTabTitle(pageName?: string | null): string {
  const name = pageName?.trim();
  return name ? `${APP_NAME} | ${name}` : APP_NAME;
}
