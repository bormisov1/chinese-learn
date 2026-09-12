import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { generate, translateWords } from './deepseek';
import { emptyStore, loadStore, saveStore } from './storage';
import { AppLanguage, StoreData, Word } from './types';
import { ImportedWord } from './ocr';
import { fillActivePool } from './card-srs';
import { replenishAutomaticWords } from './hsk-vocabulary';
import { Dictionary, loadDictionary } from './dictionary';
import { refreshWords, switchStoreLanguage } from './language';

type Context = { data: StoreData; ready: boolean; generating: boolean; error: string; dictionary: Dictionary | null; dictionaryLoading: boolean; dictionaryError: string; switchingLanguage: AppLanguage | null; selectLanguage: (language: AppLanguage) => Promise<boolean>; retryDictionary: () => void; importWords: (items: ImportedWord[]) => number; importWordBackup: (items: Omit<Word, 'id'>[], sourceLanguage: AppLanguage) => number; patch: (fn: (data: StoreData) => StoreData) => void; setAutomaticWordAddition: (enabled: boolean, completeOnboarding?: boolean) => void; generateBatch: (mandatory?: Word) => Promise<void> };
const StoreContext = createContext<Context>(null as never);
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData>(emptyStore), [ready, setReady] = useState(false), [generating, setGenerating] = useState(false), [error, setError] = useState('');
  const [loadedDictionary, setLoadedDictionary] = useState<{ language: AppLanguage; value: Dictionary } | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false), [dictionaryError, setDictionaryError] = useState(''), [switchingLanguage, setSwitchingLanguage] = useState<AppLanguage | null>(null), [dictionaryReload, setDictionaryReload] = useState(0);
  const dictionaryRef = useRef<{ language: AppLanguage; value: Dictionary } | null>(null), switchRequest = useRef(0), languageRef = useRef<AppLanguage>(data.settings.language);
  languageRef.current = data.settings.language;
  const dictionary = loadedDictionary?.language === data.settings.language ? loadedDictionary.value : null;
  useEffect(() => { loadStore().then(value => { setData(value); setReady(true); }); }, []);
  useEffect(() => { if (ready) saveStore(data); }, [data, ready]);
  useEffect(() => {
    if (!ready || !data.languageSelected || dictionaryRef.current?.language === data.settings.language) return;
    const language = data.settings.language;
    let active = true;
    setDictionaryLoading(true); setDictionaryError('');
    loadDictionary(language).then(value => {
      if (!active) return;
      dictionaryRef.current = { language, value };
      setLoadedDictionary({ language, value });
      setData(current => current.settings.language === language ? { ...current, words: refreshWords(current.words, language, value) } : current);
    }).catch(reason => { if (active) setDictionaryError(reason instanceof Error ? reason.message : 'Dictionary download failed.'); })
      .finally(() => { if (active) setDictionaryLoading(false); });
    return () => { active = false; };
  }, [ready, data.languageSelected, data.settings.language, dictionaryReload]);
  useEffect(() => {
    if (!ready || !dictionary || !data.onboardingComplete || !data.settings.automaticWordAddition) return;
    setData(current => {
      const words = replenishAutomaticWords(current.words, dictionary, Date.now(), current.cardRound);
      return words === current.words ? current : { ...current, words };
    });
  }, [ready, dictionary, data.onboardingComplete, data.settings.automaticWordAddition, data.words]);
  const selectLanguage = async (language: AppLanguage) => {
    const request = ++switchRequest.current;
    if (data.languageSelected && data.settings.language === language && dictionaryRef.current?.language === language) {
      setDictionaryError(''); setSwitchingLanguage(null);
      return true;
    }
    setSwitchingLanguage(language); setDictionaryError('');
    try {
      let value = await loadDictionary(language);
      if (switchRequest.current !== request) return false;
      const unresolved = data.words.filter(word => !value.has(word.hanzi) && !word.translationByLanguage?.[language]?.trim());
      if (unresolved.length && data.settings.apiKey.trim()) {
        try {
          const translated = await translateWords(data.settings, unresolved.map(word => word.hanzi), language);
          if (switchRequest.current !== request) return false;
          if (translated.length) value = new Map([...value, ...translated.map(word => [word.hanzi, word] as const)]);
        } catch { /* Dictionary switching remains available when the optional AI fallback fails. */ }
      }
      dictionaryRef.current = { language, value };
      setLoadedDictionary({ language, value });
      setDictionaryLoading(false);
      setError('');
      setData(current => switchStoreLanguage(current, language, value));
      return true;
    } catch (reason) {
      if (switchRequest.current === request) setDictionaryError(reason instanceof Error ? reason.message : 'Dictionary download failed.');
      return false;
    } finally {
      if (switchRequest.current === request) setSwitchingLanguage(null);
    }
  };
  const retryDictionary = () => { setDictionaryError(''); setDictionaryReload(value => value + 1); };
  const patch = (fn: (value: StoreData) => StoreData) => setData(fn);
  const setAutomaticWordAddition = (enabled: boolean, completeOnboarding = false) => {
    setData(current => ({
      ...current,
      onboardingComplete: completeOnboarding || current.onboardingComplete,
      settings: { ...current.settings, automaticWordAddition: enabled },
      words: enabled && dictionary ? replenishAutomaticWords(current.words, dictionary, Date.now(), current.cardRound) : current.words,
    }));
  };
  const importWords = (items: ImportedWord[]) => {
    const existing = new Set(data.words.map(w => w.hanzi));
    const fresh = items.filter(w => !existing.has(w.hanzi));
    if (fresh.length) setData(d => ({ ...d, words: fillActivePool([...d.words, ...fresh.map(w => ({ ...w, translationByLanguage: { [d.settings.language]: w.russian }, id: id(), exampleCount: 0, wordShownCount: 0, createdAt: Date.now(), srsLevel: 0, srsCorrect: 0, srsIncorrect: 0, srsDueAt: 0, cardSrsLevel: 0, cardSrsCorrect: 0, cardSrsIncorrect: 0, cardSrsDueAt: 0, cardLapses: 0 }))], Date.now(), d.cardRound) }));
    return fresh.length;
  };
  const importWordBackup = (items: Omit<Word, 'id'>[], sourceLanguage: AppLanguage) => {
    if (!dictionary && sourceLanguage !== data.settings.language) throw new Error('Current-language dictionary must finish loading before restoring this backup.');
    setData(d => {
      const localized = items.map(w => {
        const active = dictionary?.get(w.hanzi);
        const translationByLanguage = { ...w.translationByLanguage, [sourceLanguage]: w.russian };
        if (active) return { ...w, pinyin: active.pinyin, russian: active.russian, translationByLanguage: { ...translationByLanguage, [d.settings.language]: active.russian } };
        return { ...w, russian: translationByLanguage[d.settings.language] ?? '', translationByLanguage };
      });
      const incoming = new Map(localized.map(w => [w.hanzi, w]));
      const words = d.words.map(w => incoming.has(w.hanzi) ? { ...incoming.get(w.hanzi)!, translationByLanguage: { ...w.translationByLanguage, ...incoming.get(w.hanzi)!.translationByLanguage }, id: w.id } : w);
      const existing = new Set(words.map(w => w.hanzi));
      return { ...d, words: fillActivePool([...words, ...localized.filter(w => !existing.has(w.hanzi)).map(w => ({ ...w, id: id() }))], Date.now(), d.cardRound) };
    });
    return items.length;
  };
  const generateBatch = async (mandatory?: Word) => {
    if (generating || !data.words.length) return;
    const language = data.settings.language;
    setGenerating(true); setError('');
    try {
      const targets = [...data.words].sort((a, b) => a.exampleCount - b.exampleCount).slice(0, 10);
      if (mandatory && !targets.some(w => w.id === mandatory.id)) targets.unshift(mandatory);
      const incoming = await generate(data.settings, data.words, targets, 20);
      if (!incoming.length) throw new Error('DeepSeek returned no valid sentences. Import function words such as 我, 你, 是, 的, 了, 在, then try again.');
      setData(current => {
        if (current.settings.language !== language) return current;
        const known = new Map(current.words.map(w => [w.hanzi, w]));
        const existing = new Set(current.sentences.map(s => s.chinese));
        const added = incoming.filter(s => !existing.has(s.chinese)).map(s => ({ ...s, id: id(), wordIds: s.chinese.split(/ +/).map(t => known.get(t)?.id).filter(Boolean) as string[], sentenceShownCount: 0 }));
        const words = current.words.map(w => ({ ...w, exampleCount: w.exampleCount + added.filter(s => s.wordIds.includes(w.id)).length }));
        const index = { ...current.wordSentenceIndex };
        for (const s of added) for (const wordId of s.wordIds) index[wordId] = [...(index[wordId] ?? []), s.id];
        return { ...current, words, sentences: [...current.sentences, ...added], wordSentenceIndex: index };
      });
    } catch (e) { if (languageRef.current === language) setError(e instanceof Error ? e.message : 'Generation failed'); } finally { setGenerating(false); }
  };
  const value = useMemo(() => ({ data, ready, generating, error, dictionary, dictionaryLoading, dictionaryError, switchingLanguage, selectLanguage, retryDictionary, importWords, importWordBackup, patch, setAutomaticWordAddition, generateBatch }), [data, ready, generating, error, dictionary, dictionaryLoading, dictionaryError, switchingLanguage]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export const useStore = () => useContext(StoreContext);
