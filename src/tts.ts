import { Platform } from "react-native";
import * as Speech from "expo-speech";
import { Settings } from "./types";
import type { ResolvedPronunciation } from "./pronunciation";
import { prepareTtsInput } from "./tts-input";

export type TtsVoice = {
  id: string;
  name: string;
  language: string;
  local: boolean;
};
export type TtsProvider = {
  id: string;
  supportsSsml: boolean;
  supported: () => boolean;
  voices: () => TtsVoice[];
  speak: (input: string, settings: Settings) => void;
  stop: () => void;
};

const supported = () =>
  Platform.OS === "web" &&
  typeof speechSynthesis !== "undefined" &&
  typeof SpeechSynthesisUtterance !== "undefined";
const browserVoices = (): TtsVoice[] =>
  supported()
    ? speechSynthesis
        .getVoices()
        .filter((v) => /^zh(?:-|_)/i.test(v.lang))
        .map((v) => ({
          id: v.voiceURI,
          name: v.name,
          language: v.lang,
          local: v.localService,
        }))
    : [];

const browserProvider: TtsProvider = {
  id: "browser",
  supportsSsml: false,
  supported,
  voices: browserVoices,
  speak(input, settings) {
    if (!supported()) return;
    speechSynthesis.cancel();
    // Web Speech does not accept SSML. Speaking the resolved pinyin still
    // preserves the chosen reading instead of making the engine infer hanzi.
    const utterance = new SpeechSynthesisUtterance(input);
    const voices = speechSynthesis.getVoices();
    const voice =
      voices.find((v) => v.voiceURI === settings.ttsVoiceURI) ??
      voices.find((v) => /^zh-CN$/i.test(v.lang)) ??
      voices.find((v) => /^zh(?:-|_)/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "zh-CN";
    utterance.rate = settings.ttsRate || 0.85;
    speechSynthesis.speak(utterance);
  },
  stop() {
    if (supported()) speechSynthesis.cancel();
  },
};

const isChineseVoice = (language: string) => /^zh(?:-|_)/i.test(language);
const selectVoice = (voices: TtsVoice[], voiceId: string) =>
  voices.find(({ id }) => id === voiceId) ??
  voices.find(({ language }) => /^zh-CN$/i.test(language)) ??
  voices.find(({ language }) => isChineseVoice(language));

let nativeVoices: TtsVoice[] = [];
let nativeVoicesPromise: Promise<TtsVoice[]> | undefined;
let nativeSpeechRequest = 0;
const nativeVoiceListeners = new Set<() => void>();

const loadNativeVoices = () => {
  if (Platform.OS === "web") return Promise.resolve(nativeVoices);
  if (!nativeVoicesPromise) {
    nativeVoicesPromise = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        nativeVoices = voices
          .filter(({ language }) => isChineseVoice(language))
          .map((voice) => ({
            id: voice.identifier,
            name: voice.name,
            language: voice.language,
            local: true,
          }));
        nativeVoiceListeners.forEach((listener) => listener());
        return nativeVoices;
      })
      .catch(() => nativeVoices);
  }
  return nativeVoicesPromise;
};

const nativeProvider: TtsProvider = {
  id: "expo-speech",
  supportsSsml: false,
  supported: () => Platform.OS !== "web",
  voices() {
    void loadNativeVoices();
    return nativeVoices;
  },
  speak(input, settings) {
    const request = ++nativeSpeechRequest;
    void loadNativeVoices().then((voices) => {
      if (request !== nativeSpeechRequest) return;
      const voice = selectVoice(voices, settings.ttsVoiceURI);
      const speak = () => {
        if (request !== nativeSpeechRequest) return;
        Speech.speak(input, {
          language: "zh-CN",
          voice: voice?.id,
          rate: settings.ttsRate || 0.85,
        });
      };
      void Speech.stop().then(speak, speak);
    });
  },
  stop() {
    nativeSpeechRequest += 1;
    void Speech.stop();
  },
};

// Add another provider here and expose its id in Settings; callers remain unchanged.
export const ttsProviders: Record<string, TtsProvider> = {
  browser: browserProvider,
  "expo-speech": nativeProvider,
};
export const getTtsProvider = (settings: Settings) => {
  if (Platform.OS !== "web") return nativeProvider;
  const provider = ttsProviders[settings.ttsProvider] ?? browserProvider;
  return provider.supported() ? provider : browserProvider;
};
export const speakMandarin = (pronunciation: ResolvedPronunciation, settings: Settings) => {
  const provider = getTtsProvider(settings);
  const voices = provider.voices();
  const voice = selectVoice(voices, settings.ttsVoiceURI);
  const input = prepareTtsInput(pronunciation, voice?.id ?? settings.ttsVoiceURI ?? "");
  provider.speak(provider.supportsSsml ? input.ssml : input.text, settings);
};
export const subscribeToVoices = (listener: () => void) => {
  if (Platform.OS === "web") {
    if (!supported()) return () => {};
    speechSynthesis.addEventListener?.("voiceschanged", listener);
    listener();
    return () => speechSynthesis.removeEventListener?.("voiceschanged", listener);
  }
  nativeVoiceListeners.add(listener);
  listener();
  void loadNativeVoices();
  return () => nativeVoiceListeners.delete(listener);
};
