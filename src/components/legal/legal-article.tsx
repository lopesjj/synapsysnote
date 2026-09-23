"use client";

import { CookiePreferences } from "@/components/legal/cookie-preferences";
import { LegalInline, fillLegal, interpolateNodes, type LegalNavigate } from "@/components/legal/legal-text";
import { LEGAL_ENTITY, LEGAL_FACTS, LEGAL_UPDATED_AT, LEGAL_VERSION } from "@/lib/legal/entity";
import type { LegalBlock, LegalDocId, LegalDocument } from "@/lib/legal/types";
import { HTML_LANG } from "@/lib/i18n/locale";
import { useTranslation, type TranslationKey } from "@/lib/i18n/translations";
import type { SupportedLanguage } from "@/types/models";
import { cn } from "@/lib/utils";

export const LEGAL_DOC_META: Record<LegalDocId, { title: TranslationKey; short: TranslationKey }> = {
  terms: { title: "legal_terms", short: "legal_terms_short" },
  privacy: { title: "legal_privacy", short: "legal_privacy_short" },
  cookies: { title: "legal_cookies", short: "legal_cookies_short" },
};

export const COOKIE_PREFERENCES_SECTION = "preferences";

/** Escritas sem serifa própria nas fontes carregadas ficam com a sans do app. */
const SANS_TITLE_LANGUAGES: readonly SupportedLanguage[] = ["ja", "zh", "ar"];

export function formatLegalDate(language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(HTML_LANG[language], { dateStyle: "long" }).format(
    new Date(`${LEGAL_UPDATED_AT}T12:00:00`)
  );
}

function Table({ head, rows, onNavigate }: { head: string[]; rows: string[][]; onNavigate: LegalNavigate }) {
  const codeFirst = rows.every((row) => /^[a-z0-9_, ]+$/.test(row[0]));
  // A quebra depende da largura do artigo (container query), não da janela.
  const wide = head.length >= 4;

  const cell = (value: string, column: number) =>
    column === 0 && codeFirst ? (
      <span className="font-mono text-[12.5px] text-ink">
        {value.split(", ").map((name) => (
          <span key={name} className="block">
            <bdi dir="ltr">{name}</bdi>
          </span>
        ))}
      </span>
    ) : (
      <LegalInline text={value} onNavigate={onNavigate} />
    );

  return (
    <>
      <dl
        className={cn(
          "divide-y divide-[var(--border)] border-y border-[var(--border)]",
          wide ? "@min-[600px]:hidden" : "@min-[460px]:hidden"
        )}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="py-3.5">
            <dt className="text-[14px] font-medium text-ink">{cell(row[0], 0)}</dt>
            {row.slice(1).map((value, offset) => (
              <dd key={offset} className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                <span className="text-faint">{head[offset + 1]}: </span>
                {cell(value, offset + 1)}
              </dd>
            ))}
          </div>
        ))}
      </dl>

      <table
        className={cn(
          "hidden w-full border-collapse text-[13.5px]",
          wide ? "@min-[600px]:table" : "@min-[460px]:table"
        )}
      >
        <thead>
          <tr className="border-b border-[var(--border-strong)]">
            {head.map((label) => (
              <th key={label} scope="col" className="pb-2 pe-4 text-start text-[12.5px] font-medium text-faint last:pe-0">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--border)] align-top">
              {row.map((value, column) => (
                <td
                  key={column}
                  className={cn(
                    "py-3 pe-4 leading-relaxed last:pe-0",
                    column === 0 ? "text-ink" : "text-muted",
                    column === 0 && codeFirst && "w-[31%]"
                  )}
                >
                  {cell(value, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Block({ block, onNavigate }: { block: LegalBlock; onNavigate: LegalNavigate }) {
  if (typeof block === "string") {
    return (
      <p>
        <LegalInline text={block} onNavigate={onNavigate} />
      </p>
    );
  }
  if ("list" in block) {
    return (
      <ul className="list-disc space-y-1.5 ps-5 marker:text-faint">
        {block.list.map((item, index) => (
          <li key={index} className="ps-1">
            <LegalInline text={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    );
  }
  if ("table" in block) {
    return <Table head={block.table.head} rows={block.table.rows} onNavigate={onNavigate} />;
  }
  return (
    <p className="border-s-2 border-[var(--accent)] ps-4 text-ink">
      <LegalInline text={block.note} onNavigate={onNavigate} />
    </p>
  );
}

export function LegalArticle({
  doc,
  document,
  onNavigate,
}: {
  doc: LegalDocId;
  document: LegalDocument;
  onNavigate: LegalNavigate;
}) {
  const { t, language, textDir } = useTranslation();
  const lang = language as SupportedLanguage;
  const contactEmail = doc === "terms" ? LEGAL_ENTITY.contactEmail : LEGAL_ENTITY.privacyEmail;
  const serif = !SANS_TITLE_LANGUAGES.includes(lang);

  return (
    <article dir={textDir} className="@container w-full max-w-[680px] pb-20">
      <header className="border-b border-[var(--border)] pb-8">
        <h1
          className={cn(
            "text-ink",
            serif
              ? "font-[family-name:var(--font-newsreader),var(--font-source-serif),Georgia,serif] text-[36px] font-normal leading-[1.1] tracking-[-0.015em] sm:text-[44px]"
              : "text-[30px] font-semibold leading-[1.2] sm:text-[36px]"
          )}
        >
          {fillLegal(document.title)}
        </h1>
        <p className="mt-4 text-[16px] leading-[1.65] text-muted">{fillLegal(document.lead)}</p>
        <p className="mt-5 text-[12.5px] text-faint">
          {t("legal_updated_on", { date: formatLegalDate(lang) })}
          <span aria-hidden className="mx-2">·</span>
          {t("legal_version", { version: LEGAL_VERSION })}
        </p>
      </header>

      <section aria-labelledby="legal-summary" className="border-b border-[var(--border)] py-8">
        <h2 id="legal-summary" className="text-[13px] font-semibold text-ink">
          {t("legal_in_summary")}
        </h2>
        <dl className="mt-5 grid gap-x-10 gap-y-5 @min-[520px]:grid-cols-2">
          {document.highlights.map((highlight) => (
            <div key={highlight.title}>
              <dt className="text-[14px] font-medium text-ink">{fillLegal(highlight.title)}</dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-muted">{fillLegal(highlight.text)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {doc === "cookies" ? <CookiePreferences id={`legal-${COOKIE_PREFERENCES_SECTION}`} className="mt-8" /> : null}

      {document.sections.map((section, index) => (
        <section
          key={section.id}
          id={`legal-${section.id}`}
          data-legal-section={section.id}
          aria-labelledby={`legal-${section.id}-title`}
          className="scroll-mt-4 pt-11"
        >
          <h2
            id={`legal-${section.id}-title`}
            className="flex gap-2.5 text-[19px] font-semibold leading-snug tracking-[-0.012em] text-ink"
          >
            <span className="min-w-[1.4em] font-normal tabular-nums text-faint">{index + 1}.</span>
            <span>{fillLegal(section.title)}</span>
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.75] text-ink/80">
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-16 border-t border-[var(--border)] pt-6 text-[14px] leading-relaxed text-muted">
        <span className="font-medium text-ink">{t("legal_questions_title")}</span>{" "}
        {interpolateNodes(t("legal_questions_text"), {
          email: (
            <a
              href={`mailto:${contactEmail}`}
              dir="ltr"
              className="text-ink underline decoration-[var(--border-strong)] underline-offset-[3px] hover:decoration-current"
            >
              {contactEmail}
            </a>
          ),
          days: LEGAL_FACTS.responseDays,
        })}
      </footer>
    </article>
  );
}
