import { Platform } from "react-native";
import { Settings } from "./types";

export type TtsVoice = {
  id: string;
  name: string;
  language: string;
  local: boolean;
};
export type TtsProvider = {
  id: string;
  supported: () => boolean;
  voices: () => TtsVoice[];
  speak: (text: string, settings: Settings) => void;
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
  supported,
  voices: browserVoices,
  speak(text, settings) {
    if (!supported()) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      text.replaceAll(" ", "").trim(),
    );
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

// Add another provider here and expose its id in Settings; callers remain unchanged.
export const ttsProviders: Record<string, TtsProvider> = {
  browser: browserProvider,
};
export const getTtsProvider = (settings: Settings) =>
  ttsProviders[settings.ttsProvider] ?? browserProvider;
export const speakMandarin = (text: string, settings: Settings) =>
  getTtsProvider(settings).speak(text, settings);
export const subscribeToVoices = (listener: () => void) => {
  if (!supported()) return () => {};
  speechSynthesis.addEventListener?.("voiceschanged", listener);
  listener();
  return () => speechSynthesis.removeEventListener?.("voiceschanged", listener);
};
