import React, { createContext, useContext } from "react";
import { Platform, Text as NativeText, TextInput as NativeTextInput } from "react-native";
import type { ComponentProps } from "react";
import type { AppLanguage } from "./types";
import translations from "./data/ui-translations.json";
import { LANGUAGES } from "./languages";
export { LANGUAGES } from "./languages";

const contextualTranslations: Partial<Record<AppLanguage, Record<string, string>>> = {
  ru: {
    "Explanation": "Объяснение",
    "Semantic component": "Смысловой компонент",
    "Phonetic component": "Фонетический компонент",
    "Remember it": "Как запомнить",
    "Back": "Назад",
    "Refresh explanation": "Обновить объяснение",
    "Get explanation": "Получить объяснение",
    "No cached explanation yet.": "Сохранённого объяснения пока нет.",
    "Cached explanation for": "Сохранённое объяснение:",
    "Get explanation for": "Получить объяснение:",
    "DeepSeek API key required": "Нужен ключ DeepSeek API",
    "A DeepSeek API key is required to use AI features. Add your key in Settings to continue.": "Для функций ИИ нужен ключ DeepSeek API. Добавьте ключ в настройках, чтобы продолжить.",
    "Open Settings": "Открыть настройки",
    "ACCOUNT": "АККАУНТ",
    "1 example": "пример",
    "examples": "примеров",
    "2 examples": "2 примера",
    "1 of 6 cards · 1 of 12 active": "1 из 6 карточек · 1 из 12 активных",
    "Correct cards skip the next round. Three correct appearances move a word to retention review and bring in another deck word.": "Правильные карточки пропускают следующий раунд. Три правильных ответа переводят слово в повторение и добавляют другое слово из колоды.",
    "Start 1-card round": "Начать раунд из 1 карточки",
    "All AI requests use DeepSeek V4 Flash.": "Все запросы к ИИ используют DeepSeek V4 Flash.",
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
    "Downloading": "Загрузка",
    "dictionary": "словаря",
    "Existing study data stays unchanged.": "Существующие учебные данные не изменятся.",
    "AI chat": "Чат с ИИ",
    "Show the floating AI chat button. Turn off to remove AI chat from the app.": "Показывать плавающую кнопку чата с ИИ. Выключите, чтобы скрыть чат в приложении.",
    "Backup study data": "Резервная копия учебных данных",
    "Download or merge a JSON backup containing vocabulary, sentences, SRS progress, and review history. API keys are never included.": "Скачайте или объедините резервную копию JSON со словами, предложениями, прогрессом SRS и историей повторений. Ключи API в неё не входят.",
    "Paste Chinese text to add words from the dictionary.": "Вставьте китайский текст, чтобы добавить слова из словаря.",
    "Import vocabulary to see SRS progress.": "Импортируйте слова, чтобы увидеть прогресс SRS.",
    "Sign out": "Выйти",
    "Continue with Google / Gmail": "Продолжить через Google / Gmail",
    "Continue with Telegram": "Продолжить через Telegram",
    "Export JSON": "Экспортировать JSON",
    "Import JSON": "Импортировать JSON",
    "of 12 words · six cards per full round": "из 12 слов · шесть карточек за полный раунд",
    "Handwriting": "Рукописный ввод",
    "Loading explanation": "Загрузка объяснения",
    "Use Refresh to try again.": "Нажмите «Обновить», чтобы повторить попытку.",
    "Draw one Hanzi here": "Нарисуйте здесь один иероглиф",
    "Retry": "Повторить",
    "Insert Hanzi": "Вставить иероглиф",
    "Enter Chinese text or add words from an HSK level.": "Введите китайский текст или добавьте слова из уровня HSK.",
    "Saved cards are unaffected.": "Сохранённые карточки не изменятся.",
    "CHINESE TEXT": "КИТАЙСКИЙ ТЕКСТ",
    "Chinese character": "Китайский иероглиф",
    "could not be matched and will be skipped.": "не найден в словаре и будет пропущен.",
    "words in your deck": "слов в вашей колоде",
    "Add and validate your DeepSeek API key in Settings to unlock Sentences, Listening, and Mix.": "Добавьте и проверьте ключ DeepSeek API в настройках, чтобы открыть предложения, аудирование и смешанные упражнения.",
    "Sentence practice": "Практика предложений",
    "Generate examples first to start an exercise.": "Сначала создайте примеры, чтобы начать упражнение.",
    "Downloading dictionary…": "Загрузка словаря…",
    "Your language was not changed. Try again.": "Язык не изменён. Попробуйте ещё раз.",
    "How would you like to build your vocabulary?": "Как вы хотите собрать свой словарь?",
    "You can change this anytime in Settings.": "Это можно изменить в настройках в любое время.",
    "Drawing recognition currently requires the web version.": "Распознавание рукописного ввода пока доступно только в веб-версии.",
    "Import at least one single-character vocabulary card first.": "Сначала импортируйте хотя бы одну карточку с одним иероглифом.",
    "Experimental · local only": "Экспериментальная функция · только на устройстве",
    "Write the Hanzi": "Напишите иероглиф",
    "· shape": "· форма",
    "Recognition uses HanziLookup Rust/WASM and the order, direction, length, and position of your strokes. It returns five local candidates from about 9,500 characters. No image or stroke data is uploaded. Shape score remains experimental. HanziLookup: LGPL; stroke data: Arphic Public License.": "Распознавание использует HanziLookup Rust/WASM и учитывает порядок, направление, длину и положение штрихов. Оно локально предлагает пять вариантов из примерно 9500 иероглифов. Изображения и данные штрихов не загружаются. Оценка формы пока экспериментальная. HanziLookup: LGPL; данные штрихов: Arphic Public License.",
    "No previous chats yet.": "Предыдущих чатов пока нет.",
    "Ask about Chinese words, a Hanzi, or a message you want to answer.": "Спросите о китайских словах, иероглифе или сообщении, на которое хотите ответить.",
    "BREAKDOWN · TAP GREEN TO ADD": "РАЗБОР · НАЖМИТЕ НА ЗЕЛЁНОЕ, ЧТОБЫ ДОБАВИТЬ",
    "Thinking…": "Думаю…",
    "CHOOSE A PROMPT": "ВЫБЕРИТЕ ТЕМУ",
    "Type a message…": "Введите сообщение…",
    "Remove": "Удалить",
    "Do you really want to remove this word from your vocabulary?": "Вы действительно хотите удалить это слово из словаря?",
    "Cancel": "Отмена",
    "words due": "слов к повторению",
    "practiced": "пройдено",
    "words and sentences mixed": "слова и предложения вперемешку",
    "words only": "только слова",
    "words, sentences, and listening": "слова, предложения и аудирование",
    "sentence": "предложение",
    "listening": "аудирование",
    "Unmatched Chinese characters will be skipped:": "Неопознанные китайские иероглифы будут пропущены:",
    "Mandarin voice": "Голос для китайского",
    "Selected voice unavailable — using automatic": "Выбранный голос недоступен — используется автоматический выбор",
  },
  th: {
    "Explanation": "คำอธิบาย",
    "Semantic component": "ส่วนบอกความหมาย",
    "Phonetic component": "ส่วนบอกเสียง",
    "Remember it": "วิธีจำ",
    "Back": "กลับ",
    "Refresh explanation": "สร้างคำอธิบายใหม่",
    "Get explanation": "สร้างคำอธิบาย",
    "No cached explanation yet.": "ยังไม่มีคำอธิบายที่บันทึกไว้",
    "Cached explanation for": "คำอธิบายที่บันทึกไว้:",
    "Get explanation for": "สร้างคำอธิบาย:",
    "DeepSeek API key required": "ต้องใช้คีย์ DeepSeek API",
    "A DeepSeek API key is required to use AI features. Add your key in Settings to continue.": "ต้องใช้คีย์ DeepSeek API เพื่อใช้งานฟีเจอร์ AI เพิ่มคีย์ในหน้าการตั้งค่าเพื่อดำเนินการต่อ",
    "Open Settings": "เปิดการตั้งค่า",
    "ACCOUNT": "บัญชี",
    "1 example": "ตัวอย่าง",
    "examples": "ตัวอย่าง",
    "2 examples": "2 ตัวอย่าง",
    "1 of 6 cards · 1 of 12 active": "1 จาก 6 บัตรคำ · 1 จาก 12 ที่กำลังเรียน",
    "Correct cards skip the next round. Three correct appearances move a word to retention review and bring in another deck word.": "บัตรคำที่ตอบถูกจะข้ามรอบถัดไป ตอบถูกสามครั้งจะย้ายคำไปทบทวนและนำคำอื่นจากชุดคำศัพท์มาแทน",
    "Start 1-card round": "เริ่มรอบ 1 บัตรคำ",
    "All AI requests use DeepSeek V4 Flash.": "คำขอ AI ทั้งหมดใช้ DeepSeek V4 Flash",
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
    "Downloading": "กำลังดาวน์โหลด",
    "dictionary": "พจนานุกรม",
    "Existing study data stays unchanged.": "ข้อมูลการเรียนที่มีอยู่จะไม่เปลี่ยนแปลง",
    "AI chat": "แชต AI",
    "Show the floating AI chat button. Turn off to remove AI chat from the app.": "แสดงปุ่มแชต AI แบบลอย ปิดเพื่อซ่อนแชต AI จากแอป",
    "Backup study data": "สำรองข้อมูลการเรียน",
    "Download or merge a JSON backup containing vocabulary, sentences, SRS progress, and review history. API keys are never included.": "ดาวน์โหลดหรือรวมไฟล์สำรอง JSON ที่มีคำศัพท์ ประโยค ความคืบหน้า SRS และประวัติการทบทวน โดยไม่รวมคีย์ API",
    "Paste Chinese text to add words from the dictionary.": "วางข้อความภาษาจีนเพื่อเพิ่มคำจากพจนานุกรม",
    "Import vocabulary to see SRS progress.": "นำเข้าคำศัพท์เพื่อดูความคืบหน้า SRS",
    "Sign out": "ออกจากระบบ",
    "Continue with Google / Gmail": "ดำเนินการต่อด้วย Google / Gmail",
    "Continue with Telegram": "ดำเนินการต่อด้วย Telegram",
    "Export JSON": "ส่งออก JSON",
    "Import JSON": "นำเข้า JSON",
    "of 12 words · six cards per full round": "จาก 12 คำ · หกบัตรคำต่อรอบเต็ม",
    "Handwriting": "เขียนด้วยมือ",
    "Loading explanation": "กำลังโหลดคำอธิบาย",
    "Use Refresh to try again.": "กดรีเฟรชเพื่อลองอีกครั้ง",
    "Draw one Hanzi here": "เขียนอักษรจีนหนึ่งตัวที่นี่",
    "Retry": "ลองอีกครั้ง",
    "Insert Hanzi": "แทรกอักษรจีน",
    "Enter Chinese text or add words from an HSK level.": "พิมพ์ข้อความภาษาจีนหรือเพิ่มคำจากระดับ HSK",
    "Saved cards are unaffected.": "บัตรคำที่บันทึกไว้จะไม่เปลี่ยนแปลง",
    "CHINESE TEXT": "ข้อความภาษาจีน",
    "Chinese character": "อักษรจีน",
    "could not be matched and will be skipped.": "ไม่พบในพจนานุกรมและจะถูกข้าม",
    "words in your deck": "คำในชุดคำศัพท์ของคุณ",
    "Add and validate your DeepSeek API key in Settings to unlock Sentences, Listening, and Mix.": "เพิ่มและตรวจสอบคีย์ DeepSeek API ในการตั้งค่าเพื่อปลดล็อกประโยค การฟัง และแบบฝึกผสม",
    "Sentence practice": "ฝึกประโยค",
    "Generate examples first to start an exercise.": "สร้างตัวอย่างก่อนเริ่มแบบฝึกหัด",
    "Downloading dictionary…": "กำลังดาวน์โหลดพจนานุกรม…",
    "Your language was not changed. Try again.": "ยังไม่ได้เปลี่ยนภาษา ลองอีกครั้ง",
    "How would you like to build your vocabulary?": "คุณต้องการสร้างคลังคำศัพท์อย่างไร?",
    "You can change this anytime in Settings.": "เปลี่ยนได้ทุกเมื่อในการตั้งค่า",
    "Drawing recognition currently requires the web version.": "การรู้จำลายมือในขณะนี้ต้องใช้เวอร์ชันเว็บ",
    "Import at least one single-character vocabulary card first.": "นำเข้าบัตรคำที่มีอักษรจีนหนึ่งตัวอย่างน้อยหนึ่งใบก่อน",
    "Experimental · local only": "ทดลอง · ใช้งานบนอุปกรณ์เท่านั้น",
    "Write the Hanzi": "เขียนอักษรจีน",
    "· shape": "· รูปร่าง",
    "Recognition uses HanziLookup Rust/WASM and the order, direction, length, and position of your strokes. It returns five local candidates from about 9,500 characters. No image or stroke data is uploaded. Shape score remains experimental. HanziLookup: LGPL; stroke data: Arphic Public License.": "การรู้จำใช้ HanziLookup Rust/WASM โดยพิจารณาลำดับ ทิศทาง ความยาว และตำแหน่งของเส้นขีด ระบบแสดงตัวเลือกห้าตัวจากอักษรจีนประมาณ 9,500 ตัวบนอุปกรณ์ ไม่มีการอัปโหลดภาพหรือข้อมูลเส้นขีด คะแนนรูปร่างยังอยู่ในขั้นทดลอง HanziLookup: LGPL; ข้อมูลเส้นขีด: Arphic Public License",
    "No previous chats yet.": "ยังไม่มีแชตก่อนหน้า",
    "Ask about Chinese words, a Hanzi, or a message you want to answer.": "ถามเกี่ยวกับคำศัพท์จีน อักษรจีน หรือข้อความที่คุณต้องการตอบ",
    "BREAKDOWN · TAP GREEN TO ADD": "แยกคำ · แตะสีเขียวเพื่อเพิ่ม",
    "Thinking…": "กำลังคิด…",
    "CHOOSE A PROMPT": "เลือกหัวข้อ",
    "Type a message…": "พิมพ์ข้อความ…",
    "Remove": "ลบ",
    "Do you really want to remove this word from your vocabulary?": "คุณต้องการลบคำนี้ออกจากคลังคำศัพท์จริงหรือไม่?",
    "Cancel": "ยกเลิก",
    "words due": "คำที่ต้องทบทวน",
    "practiced": "ฝึกแล้ว",
    "words and sentences mixed": "คำและประโยคผสมกัน",
    "words only": "เฉพาะคำ",
    "words, sentences, and listening": "คำ ประโยค และการฟัง",
    "sentence": "ประโยค",
    "listening": "การฟัง",
    "Unmatched Chinese characters will be skipped:": "อักษรจีนที่ไม่พบจะถูกข้าม:",
    "Mandarin voice": "เสียงภาษาจีนกลาง",
    "Selected voice unavailable — using automatic": "เสียงที่เลือกไม่พร้อมใช้งาน — ใช้การเลือกอัตโนมัติ",
  },
};

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
    .reduce((result, [source, target]) => {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const before = /^[\p{L}\p{N}]/u.test(source) ? "(?<![\\p{L}\\p{N}])" : "";
      const after = /[\p{L}\p{N}]$/u.test(source) ? "(?![\\p{L}\\p{N}])" : "";
      return result.replace(new RegExp(`${before}${escaped}${after}`, "gu"), target);
    }, value));
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
