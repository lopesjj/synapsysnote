import type { SupportedLanguage } from "@/types/models";

export interface LanguageDefinition {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
  {
    code: "pt",
    name: "Português",
    nativeName: "Português",
    flag: "🇧🇷",
  },
  {
    code: "en",
    name: "Inglês",
    nativeName: "English",
    flag: "🇺🇸",
  },
  {
    code: "es",
    name: "Espanhol",
    nativeName: "Español",
    flag: "🇪🇸",
  },
  {
    code: "fr",
    name: "Francês",
    nativeName: "Français",
    flag: "🇫🇷",
  },
  {
    code: "it",
    name: "Italiano",
    nativeName: "Italiano",
    flag: "🇮🇹",
  },
  {
    code: "de",
    name: "Alemão",
    nativeName: "Deutsch",
    flag: "🇩🇪",
  },
  {
    code: "ru",
    name: "Russo",
    nativeName: "Русский",
    flag: "🇷🇺",
  },
  {
    code: "ja",
    name: "Japonês",
    nativeName: "日本語",
    flag: "🇯🇵",
  },
  {
    code: "zh",
    name: "Chinês",
    nativeName: "简体中文",
    flag: "🇨🇳",
  },
];

export function getLanguageDefinition(code: SupportedLanguage): LanguageDefinition {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code) ?? SUPPORTED_LANGUAGES[0];
}
