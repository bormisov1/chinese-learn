import { Platform } from "react-native";
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

// Add another provider here and expose its id in Settings; callers remain unchanged.
export const ttsProviders: Record<string, TtsProvider> = {
  browser: browserProvider,
};
export const getTtsProvider = (settings: Settings) =>
  ttsProviders[settings.ttsProvider] ?? browserProvider;
export const speakMandarin = (pronunciation: ResolvedPronunciation, settings: Settings) => {
  const provider = getTtsProvider(settings);
  const voices = provider.voices();
  const voice = voices.find(({ id }) => id === settings.ttsVoiceURI)
    ?? voices.find(({ language }) => /^zh-CN$/i.test(language))
    ?? voices[0];
  const input = prepareTtsInput(pronunciation, voice?.id ?? settings.ttsVoiceURI ?? "");
  provider.speak(provider.supportsSsml ? input.ssml : input.text, settings);
};
export const subscribeToVoices = (listener: () => void) => {
  if (!supported()) return () => {};
  speechSynthesis.addEventListener?.("voiceschanged", listener);
  listener();
  return () => speechSynthesis.removeEventListener?.("voiceschanged", listener);
};
