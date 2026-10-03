"use client";

import { useEffect, useRef } from "react";
import { optionalAuthHeader } from "@/lib/firebase/auth-headers";
import { mottoMarks } from "./mottos";
import { useStudy } from "./provider";

interface MottoPayload {
  id?: string;
  author?: string;
  en?: string;
  text?: string;
}

export function useDailyMotto(language: string): { text: string; open: string; close: string; author: string } | null {
  const { ready, today, settings, actions } = useStudy();
  const motto = settings.motto;
  const readyText = motto?.day === today ? motto.texts[language] || (language === "en" ? motto.en : "") : "";
  const flight = useRef(0);

  useEffect(() => {
    if (!ready || readyText) return;
    const ticket = flight.current + 1;
    flight.current = ticket;
    const controller = new AbortController();
    const held = motto?.day === today ? { id: motto.id, author: motto.author, en: motto.en } : null;
    void (async () => {
      try {
        const headers = await optionalAuthHeader();
        const response = await fetch("/api/study/motto", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ day: today, language, seen: settings.seenMottoIds, held }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as MottoPayload;
        if (flight.current !== ticket) return;
        if (!payload.id || !payload.en || !payload.text) return;
        await actions.saveDailyMotto({
          day: today,
          id: payload.id,
          author: payload.author ?? "",
          en: payload.en,
          language,
          text: payload.text,
        });
      } catch {}
    })();
    return () => controller.abort();
  }, [actions, language, motto, ready, readyText, settings.seenMottoIds, today]);

  if (!readyText) return null;
  const [open, close] = mottoMarks(language);
  return { text: readyText, open, close, author: motto?.day === today ? motto.author : "" };
}
