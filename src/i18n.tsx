import React, { createContext, useContext } from "react";
import { Platform, Text as NativeText, TextInput as NativeTextInput } from "react-native";
import type { ComponentProps } from "react";
import type { AppLanguage } from "./types";
import translations from "./data/ui-translations.json";

export const LANGUAGES: { code: AppLanguage; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "sr", label: "Serbian", nativeLabel: "Српски" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "fil", label: "Filipino", nativeLabel: "Filipino" },
];
export const isAppLanguage = (value: unknown): value is AppLanguage => LANGUAGES.some(item => item.code === value);

const LanguageContext = createContext<AppLanguage>("en");
export const I18nProvider = LanguageContext.Provider;
export const useLanguage = () => useContext(LanguageContext);

export function suggestedLanguage(): AppLanguage {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return "en";
  const supported = new Set(LANGUAGES.map(({ code }) => code));
  for (const locale of navigator.languages ?? [navigator.language]) {
    const normalized = locale.toLowerCase().split("-")[0];
    if (normalized === "tl") return "fil";
    if (supported.has(normalized as AppLanguage)) return normalized as AppLanguage;
  }
  return "en";
}

export function translate(language: AppLanguage, value: string): string {
  if (language === "en") return value;
  const table = translations[language] as Record<string, string> | undefined;
  return table?.[value] || value;
}

export function useTranslation() {
  const language = useLanguage();
  return (value: string) => translate(language, value);
}

export function Text(props: ComponentProps<typeof NativeText>) {
  const t = useTranslation();
  const children = typeof props.children === "string" ? t(props.children) : props.children;
  return <NativeText {...props}>{children}</NativeText>;
}

export function TextInput(props: ComponentProps<typeof NativeTextInput>) {
  const t = useTranslation();
  return <NativeTextInput {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} />;
}
