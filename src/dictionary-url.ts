import type { AppLanguage } from "./types";

const ASSET_PATHS: Record<AppLanguage, string> = {
  en: "/dictionaries/hsk-en.json",
  ru: "/dictionaries/hsk-ru.json",
  th: "/dictionaries/hsk-en.json",
};
const NATIVE_ASSET_ORIGIN = "https://zh.x.bormisov.com";

export function dictionaryAssetUrl(language: AppLanguage, platform: string): string {
  const path = ASSET_PATHS[language];
  if (!path) throw new Error("Unsupported dictionary language.");
  if (platform === "web") return path;
  return new URL(path, `${NATIVE_ASSET_ORIGIN}/`).toString();
}
