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

  const clients = ["gtx", "dict-chrome-ex"];
  for (const client of clients) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=${client}&sl=auto&tl=${encodeURIComponent(
        normalizedLang
      )}&dt=t&q=${encodeURIComponent(clean)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translated = data[0].map((part: unknown[]) => part?.[0] ?? "").join("");
          if (translated && translated.trim()) {
            if (clientTranslationCache.size > 2000) {
              clientTranslationCache.clear();
            }
            clientTranslationCache.set(cacheKey, translated);
            return translated;
          }
        }
      }
    } catch {}
  }

  return clean;
}
