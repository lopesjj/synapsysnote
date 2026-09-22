"use client";

import { useEffect, useId, useRef } from "react";
import { getRecaptchaSiteKey, isRecaptchaEnabled } from "@/lib/recaptcha";
import { useTheme } from "@/components/theme-provider";
import { useTranslation } from "@/lib/i18n/translations";
import type { SupportedLanguage } from "@/types/models";

const SCRIPT_BASE = "https://www.google.com/recaptcha/enterprise.js?render=explicit";

const RECAPTCHA_LANGUAGE: Record<SupportedLanguage, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
  it: "it",
  de: "de",
  ru: "ru",
  ja: "ja",
  zh: "zh-CN",
  ar: "ar",
};

type GrecaptchaApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    parameters: {
      sitekey: string;
      theme?: "light" | "dark";
      hl?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => number;
};

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi & { enterprise?: GrecaptchaApi };
  }
}

function recaptchaApi() {
  return window.grecaptcha?.enterprise ?? window.grecaptcha;
}

function loadScript(hl: string) {
  if (document.querySelector(`script[src^="${SCRIPT_BASE}"]`)) return;
  const script = document.createElement("script");
  script.src = `${SCRIPT_BASE}&hl=${hl}`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export function RecaptchaField({
  onChange,
}: {
  onChange: (token: string | null) => void;
}) {
  const siteKey = getRecaptchaSiteKey();
  const { theme } = useTheme();
  const { t, language } = useTranslation();
  const hl = RECAPTCHA_LANGUAGE[language as SupportedLanguage] ?? "pt-BR";
  const loadFailed = t("recaptcha_load_failed");
  const hostId = useId();
  const widgetId = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!siteKey) return;
    loadScript(hl);

    let cancelled = false;
    const host = document.getElementById(hostId);
    if (!host) return;

    const mount = () => {
      const api = recaptchaApi();
      if (cancelled || !api || widgetId.current !== null) return;
      host.innerHTML = "";
      try {
        widgetId.current = api.render(host, {
          sitekey: siteKey,
          theme: theme === "dark" ? "dark" : "light",
          hl,
          callback: (token) => onChangeRef.current(token),
          "expired-callback": () => onChangeRef.current(null),
          "error-callback": () => onChangeRef.current(null),
        });
      } catch {
        host.textContent = loadFailed;
      }
    };

    const started = Date.now();
    const wait = () => {
      if (cancelled) return;
      const api = recaptchaApi();
      if (api?.ready) {
        api.ready(mount);
        return;
      }
      if (Date.now() - started > 8000) {
        host.textContent = loadFailed;
        return;
      }
      window.setTimeout(wait, 80);
    };
    wait();

    return () => {
      cancelled = true;
      widgetId.current = null;
      onChangeRef.current(null);
    };
  }, [hl, hostId, loadFailed, siteKey, theme]);

  if (!isRecaptchaEnabled()) return null;

  return (
    <div className="overflow-x-auto">
      <div id={hostId} className="min-h-[78px]" />
    </div>
  );
}
