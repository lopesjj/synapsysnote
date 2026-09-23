"use client";

import { create } from "zustand";
import { readCookie, writeCookie } from "@/lib/browser-cookies";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  parseConsent,
  serializeConsent,
  type CookieConsent,
} from "./consent";
import type { LegalDocId } from "./types";

interface LegalState {
  open: boolean;
  doc: LegalDocId;
  /** Seção para rolar ao abrir; consumida pelo documento. */
  section: string | null;
  /**
   * `undefined` enquanto o cookie não foi lido (SSR e primeiro render), para o
   * banner não piscar para quem já escolheu.
   */
  consent: CookieConsent | null | undefined;
  openDoc: (doc: LegalDocId, section?: string | null) => void;
  close: () => void;
  clearSection: () => void;
  hydrateConsent: () => void;
  saveConsent: (consent: CookieConsent) => void;
}

function clearFunctionalCookies() {
  try {
    void fetch("/api/consent", { method: "POST", credentials: "same-origin" }).catch(() => {});
  } catch {}
}

export const useLegalStore = create<LegalState>((set) => ({
  open: false,
  doc: "terms",
  section: null,
  consent: undefined,
  openDoc: (doc, section = null) => set({ open: true, doc, section }),
  close: () => set({ open: false, section: null }),
  clearSection: () => set({ section: null }),
  hydrateConsent: () => set({ consent: parseConsent(readCookie(CONSENT_COOKIE)) }),
  saveConsent: (consent) => {
    writeCookie(CONSENT_COOKIE, serializeConsent(consent), CONSENT_MAX_AGE);
    if (!consent.functional) clearFunctionalCookies();
    set({ consent });
  },
}));
