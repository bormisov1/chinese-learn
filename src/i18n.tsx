import React, { createContext, useContext } from "react";
import { Platform, Text as NativeText, TextInput as NativeTextInput } from "react-native";
import type { ComponentProps } from "react";
import type { AppLanguage } from "./types";
import translations from "./data/ui-translations.json";

const contextualTranslations: Partial<Record<AppLanguage, Record<string, string>>> = {
  ru: {
    "ACCOUNT": "АККАУНТ",
    "1 example": "пример",
    "examples": "примеров",
    "2 examples": "2 примера",
    "1 of 6 cards · 1 of 12 active": "1 из 6 карточек · 1 из 12 активных",
    "Correct cards skip the next round. Three correct appearances move a word to retention review and bring in another deck word.": "Правильные карточки пропускают следующий раунд. Три правильных ответа переводят слово в повторение и добавляют другое слово из колоды.",
    "Start 1-card round": "Начать раунд из 1 карточки",
    "Sentence generation and explanations use DeepSeek V4 Pro. Translation checks use DeepSeek V4 Flash.": "Генерация предложений и объяснения используют DeepSeek V4 Pro. Проверка переводов использует DeepSeek V4 Flash.",
    "Vocabulary, generated sentences, indexes, SRS counters, and attempts remain on device. Only AI requests go to DeepSeek.": "Словарь, созданные предложения, индексы, счётчики СРС и попытки остаются на устройстве. Только запросы к ИИ отправляются в ДипСик.",
    "Build your deck from an HSK level or another source.": "Соберите колоду из уровня ХСК или другого источника.",
    "Keep 20 learning words ready, adding them in order from HSK 1 onward.": "Поддерживайте 20 слов для изучения, добавляя их по порядку начиная с ХСК 1.",
    "Choose a level and add seven new words at a time.": "Выберите уровень и добавляйте по семь новых слов за раз.",
    "Add words from screenshots or Chinese text.": "Добавляйте слова со снимков экрана или из китайского текста.",
    "1 of 12 words · six cards per full round": "1 из 12 слов · шесть карточек за полный раунд",
    "Words enter the active set in this order as learning slots open.": "Слова входят в активный набор в этом порядке по мере освобождения учебных слотов.",
    "English": "Английский",
    "LANGUAGE": "ЯЗЫК",
    "Add": "Добавить",
    "words remaining": "слов осталось",
    "six cards per full round": "шесть карточек за полный раунд",
    "due": "срок",
    "Correct": "Знал",
    "Not quite yet": "Не знал",
    "WRONG": "НЕ ЗНАЛ",
    "RIGHT": "ЗНАЛ",
    "Wrong": "Не знал",
    "Right": "Знал",
    "← Wrong · Right →": "← Не знал · Знал →",
    "HSK": "HSK",
    "SRS": "SRS",
    "DEEPSEEK API KEY": "DEEPSEEK API KEY",
    "API ENDPOINT": "API ENDPOINT",
    "How to get a DeepSeek API key": "Как получить ключ DeepSeek API",
    "to review": "на повторение",
    "correct": "знал",
    "mistaken": "не знал",
    "Swipe either direction to meet the new active word": "Проведите в любую сторону, чтобы увидеть новое активное слово",
    "Swipe any direction to continue": "Проведите в любую сторону, чтобы продолжить",
  },
  th: {
    "ACCOUNT": "บัญชี",
    "1 example": "ตัวอย่าง",
    "examples": "ตัวอย่าง",
    "2 examples": "2 ตัวอย่าง",
    "1 of 6 cards · 1 of 12 active": "1 จาก 6 บัตรคำ · 1 จาก 12 ที่กำลังเรียน",
    "Correct cards skip the next round. Three correct appearances move a word to retention review and bring in another deck word.": "บัตรคำที่ตอบถูกจะข้ามรอบถัดไป ตอบถูกสามครั้งจะย้ายคำไปทบทวนและนำคำอื่นจากชุดคำศัพท์มาแทน",
    "Start 1-card round": "เริ่มรอบ 1 บัตรคำ",
    "Sentence generation and explanations use DeepSeek V4 Pro. Translation checks use DeepSeek V4 Flash.": "การสร้างประโยคและคำอธิบายใช้ DeepSeek V4 Pro การตรวจคำแปลใช้ DeepSeek V4 Flash",
    "Vocabulary, generated sentences, indexes, SRS counters, and attempts remain on device. Only AI requests go to DeepSeek.": "คลังคำศัพท์ ประโยคที่สร้าง ดัชนี ตัวนับเอสอาร์เอส และความพยายามอยู่ในอุปกรณ์ คำขอจากเอไอเท่านั้นที่ส่งไปดีปซีค",
    "Build your deck from an HSK level or another source.": "สร้างชุดคำศัพท์จากระดับเอชเอสเคหรือแหล่งอื่น",
    "Keep 20 learning words ready, adding them in order from HSK 1 onward.": "เตรียมคำสำหรับเรียนรู้ 20 คำ โดยเพิ่มตามลำดับเริ่มจากเอชเอสเค 1",
    "Choose a level and add seven new words at a time.": "เลือกระดับและเพิ่มคำใหม่ครั้งละเจ็ดคำ",
    "Add words from screenshots or Chinese text.": "เพิ่มคำจากภาพหน้าจอหรือข้อความภาษาจีน",
    "1 of 12 words · six cards per full round": "1 จาก 12 คำ · หกบัตรคำต่อรอบเต็ม",
    "Words enter the active set in this order as learning slots open.": "คำศัพท์จะเข้าสู่ชุดที่กำลังเรียนตามลำดับนี้เมื่อมีช่องว่าง",
    "English": "อังกฤษ",
    "LANGUAGE": "ภาษา",
    "Add": "เพิ่ม",
    "words remaining": "คำที่เหลือ",
    "six cards per full round": "หกบัตรคำต่อรอบเต็ม",
    "due": "ถึงกำหนด",
    "Correct": "ทราบแล้ว",
    "Not quite yet": "ไม่ทราบ",
    "WRONG": "ไม่ทราบ",
    "RIGHT": "ทราบแล้ว",
    "Wrong": "ไม่ทราบ",
    "Right": "ทราบแล้ว",
    "← Wrong · Right →": "← ไม่ทราบ · ทราบแล้ว →",
    "HSK": "HSK",
    "SRS": "SRS",
    "DEEPSEEK API KEY": "DEEPSEEK API KEY",
    "API ENDPOINT": "API ENDPOINT",
    "How to get a DeepSeek API key": "วิธีรับคีย์ DeepSeek API",
    "to review": "ต้องทบทวน",
    "correct": "ทราบแล้ว",
    "mistaken": "ไม่ทราบ",
    "Swipe either direction to meet the new active word": "ปัดไปทางใดก็ได้เพื่อดูคำที่กำลังเรียนคำใหม่",
    "Swipe any direction to continue": "ปัดไปทางใดก็ได้เพื่อดำเนินการต่อ",
  },
};

export const LANGUAGES: { code: AppLanguage; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
];
export const isAppLanguage = (value: unknown): value is AppLanguage => LANGUAGES.some(item => item.code === value);

function keepProductTermsInEnglish(language: AppLanguage, value: string): string {
  if (language === "en") return value;
  return value
    .replaceAll("АПИ", "API")
    .replaceAll("ДИПСИК", "DEEPSEEK")
    .replaceAll("ДипСик", "DeepSeek")
    .replaceAll("ХСК", "HSK")
    .replaceAll("СРС", "SRS")
    .replaceAll("เอพีไอ", "API")
    .replaceAll("ดีปซีค", "DeepSeek")
    .replaceAll("เอชเอสเค", "HSK")
    .replaceAll("เอสอาร์เอส", "SRS");
}

const LanguageContext = createContext<AppLanguage>("en");
export const I18nProvider = LanguageContext.Provider;
export const useLanguage = () => useContext(LanguageContext);

export function suggestedLanguage(): AppLanguage {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return "en";
  const supported = new Set(LANGUAGES.map(({ code }) => code));
  for (const locale of navigator.languages ?? [navigator.language]) {
    const normalized = locale.toLowerCase().split("-")[0];
    if (supported.has(normalized as AppLanguage)) return normalized as AppLanguage;
  }
  return "en";
}

export function translate(language: AppLanguage, value: string): string {
  if (language === "en") return value;
  const table = translations[language] as Record<string, string> | undefined;
  if (!table) return keepProductTermsInEnglish(language, value);
  const contextual = contextualTranslations[language] ?? {};
  if (contextual[value] || table[value]) return keepProductTermsInEnglish(language, contextual[value] || table[value]);
  const entries = Object.entries({ ...table, ...contextual });
  const normalized = value.replace(/\s+/g, " ").trim();
  const normalizedMatch = entries.find(([source]) => source.replace(/\s+/g, " ").trim() === normalized);
  if (normalizedMatch) return keepProductTermsInEnglish(language, normalizedMatch[1]);
  return keepProductTermsInEnglish(language, entries
    .filter(([source]) => source.length > 1 && value.includes(source))
    .sort(([a], [b]) => b.length - a.length)
    .reduce((result, [source, target]) => result.replaceAll(source, target), value));
}

export function displayTranslation(value: string, language: AppLanguage): string {
  return value.trim() || translate(language, "Translation unavailable");
}

export function maskTranslatedHanzi(translation: string, hanzi: string): string {
  const translatedCharacters = new Set(
    [...hanzi].filter((character) => /\p{Script=Han}/u.test(character)),
  );
  return [...translation]
    .map((character) => translatedCharacters.has(character) ? "□" : character)
    .join("");
}

export function useTranslation() {
  const language = useLanguage();
  return (value: string) => translate(language, value);
}

export function Text(props: ComponentProps<typeof NativeText>) {
  const t = useTranslation();
  const children = React.Children.map(props.children, child => typeof child === "string" ? t(child) : child);
  return <NativeText {...props}>{children}</NativeText>;
}

export function TextInput(props: ComponentProps<typeof NativeTextInput>) {
  const t = useTranslation();
  return <NativeTextInput {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} />;
}
