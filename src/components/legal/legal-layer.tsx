"use client";

import { useEffect, useRef } from "react";
import { CookieBanner } from "@/components/legal/cookie-banner";
import { LegalCenter } from "@/components/legal/legal-center";
import { useLegalStore } from "@/lib/legal/store";
import type { LegalDocId } from "@/lib/legal/types";

/** Âncoras aceitas na URL: `/pt#privacy`, `/pt#privacidade/retention`... */
const HASH_DOCS: Record<string, LegalDocId> = {
  terms: "terms",
  termos: "terms",
  privacy: "privacy",
  privacidade: "privacy",
  cookies: "cookies",
};

function docFromHash(hash: string): { doc: LegalDocId; section: string | null } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  const [key, section] = decoded.split("/");
  const doc = HASH_DOCS[key?.toLowerCase() ?? ""];
  return doc ? { doc, section: section || null } : null;
}

/**
 * Central legal e banner de cookies das páginas públicas. O documento aberto
 * fica na âncora da URL, então um link como `synapsysnt.com.br/pt#privacy`
 * abre direto na Política de Privacidade.
 */
export function LegalLayer({ banner = true }: { banner?: boolean }) {
  const open = useLegalStore((state) => state.open);
  const doc = useLegalStore((state) => state.doc);
  const openDoc = useLegalStore((state) => state.openDoc);
  const hydrateConsent = useLegalStore((state) => state.hydrateConsent);
  const wasOpen = useRef(false);

  useEffect(() => {
    hydrateConsent();
    const sync = () => {
      const target = docFromHash(window.location.hash);
      if (target) openDoc(target.doc, target.section);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [hydrateConsent, openDoc]);

  useEffect(() => {
    if (!open && !wasOpen.current) return;
    wasOpen.current = open;
    const { pathname, search, hash } = window.location;
    const next = open ? `#${doc}` : "";
    if (hash === next || (hash.startsWith(`#${doc}/`) && open)) return;
    window.history.replaceState(window.history.state, "", `${pathname}${search}${next}`);
  }, [open, doc]);

  return (
    <>
      <LegalCenter />
      {banner ? <CookieBanner /> : null}
    </>
  );
}
