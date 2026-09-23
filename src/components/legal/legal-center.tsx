"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Link2, X } from "lucide-react";
import { DialogShell } from "@/components/ui/dialog";
import { Skeleton, Tooltip } from "@/components/ui/primitives";
import { LEGAL_DOC_META, LegalArticle } from "@/components/legal/legal-article";
import { fillLegal } from "@/components/legal/legal-text";
import { loadLegalBundle } from "@/lib/legal/load";
import { useLegalStore } from "@/lib/legal/store";
import { LEGAL_DOC_IDS, type LegalBundle, type LegalDocId } from "@/lib/legal/types";
import { HTML_LANG } from "@/lib/i18n/locale";
import { useTranslation } from "@/lib/i18n/translations";
import { useUiStore } from "@/lib/store/ui-store";
import type { SupportedLanguage } from "@/types/models";
import { cn } from "@/lib/utils";

/** Fração da altura visível em que o título de uma seção passa a contar como atual. */
const SPY_RATIO = 0.3;

function ArticleSkeleton() {
  return (
    <div className="w-full max-w-[680px]" aria-busy>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="mt-5 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-12 h-4 w-24" />
      <Skeleton className="mt-5 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-11/12" />
      <Skeleton className="mt-2 h-4 w-3/4" />
    </div>
  );
}

function offsetOf(container: HTMLElement, target: HTMLElement) {
  const box = container.getBoundingClientRect();
  const scale = container.offsetHeight > 0 && box.height > 0 ? box.height / container.offsetHeight : 1;
  return container.scrollTop + (target.getBoundingClientRect().top - box.top) / scale - 24;
}

const iconButton =
  "flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-faint transition hover:bg-[var(--surface-hover)] hover:text-ink";

export function LegalCenter() {
  const { t, language, textDir } = useTranslation();
  const open = useLegalStore((state) => state.open);
  const doc = useLegalStore((state) => state.doc);
  const section = useLegalStore((state) => state.section);
  const openDoc = useLegalStore((state) => state.openDoc);
  const close = useLegalStore((state) => state.close);
  const clearSection = useLegalStore((state) => state.clearSection);
  const reducedMotion = useUiStore((state) => state.reducedMotion);

  const [loaded, setLoaded] = useState<{ language: SupportedLanguage; bundle: LegalBundle } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionConsumed = useRef(false);

  const lang = language as SupportedLanguage;
  const content = loaded?.language === lang ? loaded.bundle[doc] : null;
  const failed = failedAttempt === `${lang}:${attempt}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadLegalBundle(lang)
      .then((bundle) => {
        if (alive) setLoaded({ language: lang, bundle });
      })
      .catch(() => {
        if (alive) setFailedAttempt(`${lang}:${attempt}`);
      });
    return () => {
      alive = false;
    };
  }, [open, lang, attempt]);

  // Documento novo abre no topo; um link para seção rola até ela.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !content) return;
    if (section) {
      const target = container.querySelector<HTMLElement>(`#legal-${CSS.escape(section)}`);
      container.scrollTop = target ? offsetOf(container, target) : 0;
      sectionConsumed.current = true;
      clearSection();
      return;
    }
    if (sectionConsumed.current) {
      sectionConsumed.current = false;
      return;
    }
    container.scrollTop = 0;
  }, [doc, content, section, clearSection]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !content) return;
    const headings = Array.from(container.querySelectorAll<HTMLElement>("[data-legal-section]"));
    const update = () => {
      const limit = container.getBoundingClientRect().top + container.clientHeight * SPY_RATIO;
      let current: string | null = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= limit) current = heading.dataset.legalSection ?? null;
        else break;
      }
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
        current = headings.at(-1)?.dataset.legalSection ?? current;
      }
      setActive(current);
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [content]);

  const scrollToSection = useCallback(
    (id: string) => {
      const container = scrollRef.current;
      const target = container?.querySelector<HTMLElement>(`#legal-${CSS.escape(id)}`);
      if (!container || !target) return;
      container.scrollTo({ top: offsetOf(container, target), behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion]
  );

  const navigate = useCallback(
    (target: LegalDocId, targetSection?: string | null) => {
      if (target === doc && targetSection) scrollToSection(targetSection);
      else openDoc(target, targetSection ?? null);
    },
    [doc, openDoc, scrollToSection]
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${lang}#${doc}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
      showClose={false}
      className="h-[min(92dvh,940px)] max-h-[calc(100dvh-2rem)] max-w-[1040px]"
    >
      <div
        dir="ltr"
        lang={HTML_LANG[lang]}
        aria-label={t(LEGAL_DOC_META[doc].title)}
        className="flex h-full min-h-0 flex-col"
      >
        <header className="flex shrink-0 items-end gap-2 border-b border-[var(--border)] ps-5 pe-3 sm:ps-8">
          <nav role="tablist" aria-label={t("legal_center")} className="-mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto sm:gap-7">
            {LEGAL_DOC_IDS.map((id) => {
              const selected = id === doc;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => openDoc(id)}
                  dir={textDir}
                  className={cn(
                    "shrink-0 border-b-2 pb-3 pt-4 text-[13.5px] transition",
                    selected
                      ? "border-[var(--text)] font-medium text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  )}
                >
                  {t(LEGAL_DOC_META[id].short)}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-0.5 pb-2">
            <Tooltip label={copied ? t("legal_link_copied") : t("legal_copy_link")}>
              <button type="button" onClick={() => void copyLink()} aria-label={t("legal_copy_link")} className={iconButton}>
                {copied ? <Check className="size-4 text-[var(--success)]" /> : <Link2 className="size-4" />}
              </button>
            </Tooltip>
            <button type="button" onClick={close} aria-label={t("close")} className={iconButton}>
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto grid max-w-[980px] gap-12 px-5 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-14">
            <nav aria-label={t("legal_on_this_page")} className="sticky top-14 hidden self-start lg:block">
              {content ? (
                <>
                  <p dir={textDir} className="text-[12px] text-faint">{t("legal_on_this_page")}</p>
                  <ol dir={textDir} className="mt-3 space-y-px">
                    {content.sections.map((item, index) => {
                      const current = active === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => scrollToSection(item.id)}
                            aria-current={current ? "location" : undefined}
                            className={cn(
                              "flex w-full gap-2 py-[3px] text-start text-[12.5px] leading-snug transition",
                              current ? "text-ink" : "text-faint hover:text-muted"
                            )}
                          >
                            <span className="w-4 shrink-0 tabular-nums">{index + 1}</span>
                            <span>{fillLegal(item.title)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : null}
            </nav>

            {content ? (
              <LegalArticle key={`${lang}-${doc}`} doc={doc} document={content} onNavigate={navigate} />
            ) : failed ? (
              <div dir={textDir} className="py-16 text-[14px] text-muted">
                {t("legal_load_failed")}{" "}
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] hover:decoration-current"
                >
                  {t("legal_retry")}
                </button>
              </div>
            ) : (
              <ArticleSkeleton />
            )}
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
