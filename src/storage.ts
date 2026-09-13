import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { StoreData } from "./types";
import { migrateCardPool } from "./card-srs";
import { isAppLanguage } from "./i18n";

const KEY = "hanzi-deck:v1";
export const emptyStore: StoreData = {
  words: [],
  sentences: [],
  wordSentenceIndex: {},
  attempts: [],
  sentenceDataByLanguage: {},
  cardRound: 0,
  mixQueue: [],
  mixPosition: 0,
  onboardingComplete: false,
  languageSelected: false,
  settings: {
    language: "en",
    apiKey: "",
    apiKeyValidated: false,
    apiUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-pro",
    ttsProvider: "browser",
    ttsVoiceURI: "",
    ttsRate: 0.85,
    automaticWordAddition: false,
  },
};

export async function loadStore(): Promise<StoreData> {
  const raw =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(KEY)
      : await AsyncStorage.getItem(KEY);
  if (!raw) return emptyStore;
  try {
    const parsed = JSON.parse(raw) as StoreData;
    const language = isAppLanguage(parsed.settings?.language) ? parsed.settings.language : "en";
    return {
      ...emptyStore,
      ...parsed,
      words: migrateCardPool(
        (parsed.words ?? []).map((w) => ({
          ...w,
          translationByLanguage: {
            ...w.translationByLanguage,
            ...(w.russian?.trim() ? { [language]: w.russian } : {}),
          },
          srsLevel: w.srsLevel ?? 0,
          srsCorrect: w.srsCorrect ?? 0,
          srsIncorrect: w.srsIncorrect ?? 0,
          srsDueAt: w.srsDueAt ?? 0,
          cardSrsLevel: w.cardSrsLevel ?? 0,
          cardSrsCorrect: w.cardSrsCorrect ?? 0,
          cardSrsIncorrect: w.cardSrsIncorrect ?? 0,
          cardSrsDueAt: w.cardSrsDueAt ?? 0,
          cardLastIncorrectAt: w.cardLastIncorrectAt,
          cardLapses: w.cardLapses ?? w.cardSrsIncorrect ?? 0,
        })),
        parsed.cardRound ?? 0,
      ),
      cardRound: parsed.cardRound ?? 0,
      mixQueue: parsed.mixQueue ?? [],
      mixPosition: parsed.mixPosition ?? 0,
      sentenceDataByLanguage: parsed.sentenceDataByLanguage ?? {},
      onboardingComplete:
        parsed.onboardingComplete ?? (parsed.words?.length ?? 0) > 0,
      languageSelected: parsed.languageSelected ?? false,
      settings: {
        ...emptyStore.settings,
        ...parsed.settings,
        language,
      },
    };
  } catch {
    return emptyStore;
  }
}
export async function saveStore(data: StoreData) {
  const raw = JSON.stringify(data);
  if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
  else await AsyncStorage.setItem(KEY, raw);
}
