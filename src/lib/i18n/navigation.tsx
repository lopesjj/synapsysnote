"use client";

import NextLink from "next/link";
import { forwardRef, useMemo, type ComponentPropsWithoutRef } from "react";
import {
  useParams,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import type { SupportedLanguage } from "@/types/models";
import { DEFAULT_LOCALE, ensureLocalized, isSupportedLanguage, stripLocale } from "./locale";

export function useLocale(): SupportedLanguage {
  const params = useParams<{ lang?: string }>();
  const lang = params?.lang;
  return isSupportedLanguage(lang) ? lang : DEFAULT_LOCALE;
}

export function usePathname(): string {
  return stripLocale(useNextPathname() ?? "/");
}

export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale();

  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(ensureLocalized(href, locale), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(ensureLocalized(href, locale), options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) =>
        router.prefetch(ensureLocalized(href, locale), options),
    }),
    [locale, router]
  );
}

type NextLinkProps = ComponentPropsWithoutRef<typeof NextLink>;

export const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link({ href, ...props }, ref) {
  const locale = useLocale();
  const localized =
    typeof href === "string"
      ? ensureLocalized(href, locale)
      : { ...href, pathname: href.pathname ? ensureLocalized(href.pathname, locale) : href.pathname };
  return <NextLink ref={ref} href={localized} {...props} />;
});

export default Link;
