import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { generate } from './deepseek';
import { emptyStore, loadStore, saveStore } from './storage';
import { StoreData, Word } from './types';
import { ImportedWord } from './ocr';
import { fillActivePool } from './card-srs';
import { replenishAutomaticWords } from './hsk-vocabulary';

type Context = { data: StoreData; ready: boolean; generating: boolean; error: string; importWords: (items: ImportedWord[]) => number; importWordBackup: (items: Omit<Word, 'id'>[]) => number; patch: (fn: (data: StoreData) => StoreData) => void; setAutomaticWordAddition: (enabled: boolean, completeOnboarding?: boolean) => void; generateBatch: (mandatory?: Word) => Promise<void> };
const StoreContext = createContext<Context>(null as never);
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData>(emptyStore), [ready, setReady] = useState(false), [generating, setGenerating] = useState(false), [error, setError] = useState('');
  useEffect(() => { loadStore().then(value => { setData(value); setReady(true); }); }, []);
  useEffect(() => { if (ready) saveStore(data); }, [data, ready]);
  useEffect(() => {
    if (!ready || !data.onboardingComplete || !data.settings.automaticWordAddition) return;
    setData(current => {
      const words = replenishAutomaticWords(current.words);
      return words === current.words ? current : { ...current, words };
    });
  }, [ready, data.onboardingComplete, data.settings.automaticWordAddition, data.words]);
  const patch = (fn: (value: StoreData) => StoreData) => setData(fn);
  const setAutomaticWordAddition = (enabled: boolean, completeOnboarding = false) => {
    setData(current => ({
      ...current,
      onboardingComplete: completeOnboarding || current.onboardingComplete,
      settings: { ...current.settings, automaticWordAddition: enabled },
      words: enabled ? replenishAutomaticWords(current.words) : current.words,
    }));
  };
  const importWords = (items: ImportedWord[]) => {
    const existing = new Set(data.words.map(w => w.hanzi));
    const fresh = items.filter(w => !existing.has(w.hanzi));
    if (fresh.length) setData(d => ({ ...d, words: fillActivePool([...d.words, ...fresh.map(w => ({ ...w, id: id(), exampleCount: 0, wordShownCount: 0, createdAt: Date.now(), srsLevel: 0, srsCorrect: 0, srsIncorrect: 0, srsDueAt: 0, cardSrsLevel: 0, cardSrsCorrect: 0, cardSrsIncorrect: 0, cardSrsDueAt: 0, cardLapses: 0 }))]) }));
    return fresh.length;
  };
  const importWordBackup = (items: Omit<Word, 'id'>[]) => {
    setData(d => {
      const incoming = new Map(items.map(w => [w.hanzi, w]));
      const words = d.words.map(w => incoming.has(w.hanzi) ? { ...incoming.get(w.hanzi)!, id: w.id } : w);
      const existing = new Set(words.map(w => w.hanzi));
      return { ...d, words: fillActivePool([...words, ...items.filter(w => !existing.has(w.hanzi)).map(w => ({ ...w, id: id() }))]) };
    });
    return items.length;
  };
  const generateBatch = async (mandatory?: Word) => {
    if (generating || !data.words.length) return;
    setGenerating(true); setError('');
    try {
      const targets = [...data.words].sort((a, b) => a.exampleCount - b.exampleCount).slice(0, 10);
      if (mandatory && !targets.some(w => w.id === mandatory.id)) targets.unshift(mandatory);
      const incoming = await generate(data.settings, data.words, targets, 20);
      if (!incoming.length) throw new Error('DeepSeek returned no valid sentences. Import function words such as 我, 你, 是, 的, 了, 在, then try again.');
      setData(current => {
        const known = new Map(current.words.map(w => [w.hanzi, w]));
        const existing = new Set(current.sentences.map(s => s.chinese));
        const added = incoming.filter(s => !existing.has(s.chinese)).map(s => ({ ...s, id: id(), wordIds: s.chinese.split(/ +/).map(t => known.get(t)?.id).filter(Boolean) as string[], sentenceShownCount: 0 }));
        const words = current.words.map(w => ({ ...w, exampleCount: w.exampleCount + added.filter(s => s.wordIds.includes(w.id)).length }));
        const index = { ...current.wordSentenceIndex };
        for (const s of added) for (const wordId of s.wordIds) index[wordId] = [...(index[wordId] ?? []), s.id];
        return { ...current, words, sentences: [...current.sentences, ...added], wordSentenceIndex: index };
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed'); } finally { setGenerating(false); }
  };
  const value = useMemo(() => ({ data, ready, generating, error, importWords, importWordBackup, patch, setAutomaticWordAddition, generateBatch }), [data, ready, generating, error]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export const useStore = () => useContext(StoreContext);
