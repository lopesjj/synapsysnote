import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLocaleProvider } from "@/components/i18n/public-locale-provider";
import { LegalLayer } from "@/components/legal/legal-layer";
import { LOCALES, isSupportedLanguage } from "@/lib/i18n/locale";
import { LOGIN_ORIGIN } from "@/lib/domains";

type LayoutParams = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: LayoutParams): Promise<Metadata> {
  const { lang } = await params;
  return {
    metadataBase: new URL(LOGIN_ORIGIN),
    alternates: {
      canonical: `/${lang}`,
      languages: {
        ...Object.fromEntries(LOCALES.map((code) => [code, `/${code}`])),
        "x-default": "/",
      },
    },
  };
}

export default async function PublicLayout({
  children,
  params,
}: LayoutParams & { children: React.ReactNode }) {
  const { lang } = await params;
  if (!isSupportedLanguage(lang)) notFound();
  return (
    <PublicLocaleProvider language={lang}>
      {children}
      <LegalLayer />
    </PublicLocaleProvider>
  );
}
