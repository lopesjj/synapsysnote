"use client";

import { useEffect, useId, useRef } from "react";
import { getRecaptchaSiteKey, isRecaptchaEnabled } from "@/lib/recaptcha";
import { useTheme } from "@/components/theme-provider";

const SCRIPT_SRC = "https://www.google.com/recaptcha/enterprise.js?render=explicit&hl=pt";

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

function loadScript() {
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
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
  const hostId = useId();
  const widgetId = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!siteKey) return;
    loadScript();

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
          hl: "pt",
          callback: (token) => onChangeRef.current(token),
          "expired-callback": () => onChangeRef.current(null),
          "error-callback": () => onChangeRef.current(null),
        });
      } catch {
        host.textContent = "Não foi possível carregar o reCAPTCHA.";
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
        host.textContent = "Não foi possível carregar o reCAPTCHA.";
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
  }, [hostId, siteKey, theme]);

  if (!isRecaptchaEnabled()) return null;

  return (
    <div className="overflow-x-auto">
      <div id={hostId} className="min-h-[78px]" />
    </div>
  );
}
