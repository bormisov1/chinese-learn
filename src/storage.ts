import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { StoreData } from "./types";
import { migrateCardPool } from "./card-srs";

const KEY = "hanzi-deck:v1";
export const emptyStore: StoreData = {
  words: [],
  sentences: [],
  wordSentenceIndex: {},
  attempts: [],
  cardRound: 0,
  settings: {
    apiKey: "",
    apiUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
    ttsProvider: "browser",
    ttsVoiceURI: "",
    ttsRate: 0.85,
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
    return {
      ...emptyStore,
      ...parsed,
      words: migrateCardPool((parsed.words ?? []).map((w) => ({
        ...w,
        srsLevel: w.srsLevel ?? 0,
        srsCorrect: w.srsCorrect ?? 0,
        srsIncorrect: w.srsIncorrect ?? 0,
        srsDueAt: w.srsDueAt ?? 0,
        cardSrsLevel: w.cardSrsLevel ?? 0,
        cardSrsCorrect: w.cardSrsCorrect ?? 0,
        cardSrsIncorrect: w.cardSrsIncorrect ?? 0,
        cardSrsDueAt: w.cardSrsDueAt ?? 0,
      }))),
      cardRound: parsed.cardRound ?? 0,
      settings: { ...emptyStore.settings, ...parsed.settings },
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
