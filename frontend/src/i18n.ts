import { getRequestConfig } from "next-intl/server";
// i18n disabled at generation time — locked to a single locale.
// To re-enable multi-language: regenerate with --i18n, or extend this list and
// add `messages/<code>.json`, then re-render the LanguageSwitcher import in
// `components/layout/header.tsx`.
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

export function getLocaleLabel(locale: Locale): string {
  const labels: Record<Locale, string> = {
    en: "English",
  };
  return labels[locale];
}

export function getLocaleFlag(locale: Locale): string {
  const flags: Record<Locale, string> = {
    en: "🇬🇧",
  };
  return flags[locale];
}
