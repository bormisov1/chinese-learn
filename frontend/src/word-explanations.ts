import type { AppLanguage, CachedExplanation, WordExplanation } from "./types";

export type ExplanationKind = "word" | "sentence";
export const normalizeExplanationText = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ");
export const explanationKey = (kind: ExplanationKind, text: string, language: AppLanguage) =>
  JSON.stringify([language, kind, normalizeExplanationText(text)]);

const hanzi = (text: string) => (text.match(/\p{Script=Han}/gu) ?? []).join('');
const filled = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const hasWordCharacterAnalysis = (explanation: WordExplanation): boolean =>
  Array.isArray(explanation?.parts) && explanation.parts.length > 0 && explanation.parts.every(part =>
    Array.isArray(part?.characters) && part.characters.length > 0 && part.characters.every(character =>
      filled(character?.semanticComponent) && filled(character?.phoneticComponent) && filled(character?.memoryAssociation)));
export function validateWordExplanation(value: unknown, target: string, kind: ExplanationKind = 'sentence'): WordExplanation {
  const result = value as WordExplanation;
  const invalid = !result || !filled(result.pinyin) || !filled(result.translation) || !filled(result.summary) || !filled(result.grammar) ||
    !Array.isArray(result.parts) || !result.parts.length ||
    result.parts.some(part => !part || !filled(part.text) || !filled(part.pinyin) || !filled(part.meaning) || !Array.isArray(part.characters) ||
      hanzi(part.text) !== part.characters.map(character => character?.hanzi).join('') ||
      part.characters.some(character => !filled(character?.hanzi) || !filled(character?.pinyin) || !filled(character?.meaning))) ||
    hanzi(target) !== result.parts.map(part => hanzi(part.text)).join('') ||
    (kind === 'word' && !hasWordCharacterAnalysis(result));
  if (invalid) throw new Error('DeepSeek returned an incomplete explanation. Please refresh to try again.');
  return result;
}

export function mergeExplanations(
  local: Record<string, CachedExplanation> = {},
  incoming: Record<string, CachedExplanation> = {},
): Record<string, CachedExplanation> {
  const merged = { ...local };
  for (const [key, entry] of Object.entries(incoming)) {
    if (!merged[key] || entry.updatedAt >= merged[key].updatedAt) merged[key] = entry;
  }
  return merged;
}
