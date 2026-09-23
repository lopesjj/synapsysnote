const clientTranslationCache = new Map<string, string>();

export async function translateTextToTarget(text: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  const normalizedLang = (targetLang || "pt").toLowerCase().split("-")[0];

  if (!clean) {
    return clean;
  }

  const cacheKey = `${normalizedLang}:${clean}`;
  const cached = clientTranslationCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch("/api/ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, targetLang: normalizedLang }),
    });

    if (res.ok) {
      const data = (await res.json()) as { translatedText?: string };
      if (data.translatedText && data.translatedText.trim()) {
        if (clientTranslationCache.size > 2000) {
          clientTranslationCache.clear();
        }
        clientTranslationCache.set(cacheKey, data.translatedText);
        return data.translatedText;
      }
    }
  } catch {}

  return clean;
}
