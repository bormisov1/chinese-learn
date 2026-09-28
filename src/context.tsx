import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { generate, translateWords } from './deepseek';
import { emptyStore, loadStore, saveStore } from './storage';
import { AppLanguage, ImportedWord, StoreData, Word } from './types';
import { fillActivePool } from './card-srs';
import { replenishAutomaticWords } from './hsk-vocabulary';
import { Dictionary, loadDictionary } from './dictionary';
import { refreshWords, switchStoreLanguage } from './language';
import { Account, authUrl, clearTokens, exchangeCode, getAccount, getTokens } from './backend';
import { bootstrapStore, syncableSnapshot } from './sync';
import { initializeTelemetry, track } from './telemetry';
import { createBackup, mergeBackupData, type BackupFile, type BackupMergeSummary } from './backup';

type Context = { data: StoreData; ready: boolean; generating: boolean; error: string; dictionary: Dictionary | null; dictionaryLoading: boolean; dictionaryError: string; dictionaryProgress: number | null; switchingLanguage: AppLanguage | null; account: Account | null; authBusy: boolean; authError: string; selectLanguage: (language: AppLanguage) => Promise<boolean>; retryDictionary: () => void; importWords: (items: ImportedWord[]) => number; patch: (fn: (data: StoreData) => StoreData) => void; createBackup: () => BackupFile; mergeBackup: (backup: BackupFile) => BackupMergeSummary; setAutomaticWordAddition: (enabled: boolean, completeOnboarding?: boolean) => void; generateBatch: (mandatory?: Word) => Promise<void>; signIn: (provider: "google" | "telegram") => Promise<void>; signOut: () => Promise<void> };
const StoreContext = createContext<Context>(null as never);
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData>(emptyStore), [ready, setReady] = useState(false), [generating, setGenerating] = useState(false), [error, setError] = useState('');
  const [account, setAccount] = useState<Account | null>(null), [authBusy, setAuthBusy] = useState(false), [authError, setAuthError] = useState('');
  const [loadedDictionary, setLoadedDictionary] = useState<{ language: AppLanguage; value: Dictionary } | null>(null);
  const [dictionaryLoading, setDictionaryLoading] = useState(false), [dictionaryError, setDictionaryError] = useState(''), [dictionaryProgress, setDictionaryProgress] = useState<number | null>(null), [switchingLanguage, setSwitchingLanguage] = useState<AppLanguage | null>(null), [dictionaryReload, setDictionaryReload] = useState(0);
  const dictionaryRef = useRef<{ language: AppLanguage; value: Dictionary } | null>(null), switchRequest = useRef(0), languageRef = useRef<AppLanguage>(data.settings.language);
  const dataRef = useRef(data), authCodeInFlight = useRef<string | null>(null), handledAuthCodes = useRef(new Set<string>()), syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null), syncedSnapshot = useRef<string | null>(null);
  dataRef.current = data;
  languageRef.current = data.settings.language;
  const dictionary = loadedDictionary?.language === data.settings.language ? loadedDictionary.value : null;
  useEffect(() => { loadStore().then(value => { setData(value); setReady(true); void initializeTelemetry(); }); }, []);
  const redirectUri = () => Platform.OS === "web" && typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "hanzideck://auth/callback";
  const completeAuth = async (url: string) => {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (!code) return;
    if (authCodeInFlight.current === code || handledAuthCodes.current.has(code)) return;
    authCodeInFlight.current = code;
    setAuthBusy(true); setAuthError('');
    try {
      const tokens = await exchangeCode(code, redirectUri());
      const remoteAccount = await getAccount();
      setAccount(remoteAccount);
      const merged = await bootstrapStore(dataRef.current);
      syncedSnapshot.current = JSON.stringify(syncableSnapshot(merged));
      setData(merged);
      handledAuthCodes.current.add(code);
      void track("login_succeeded", { provider: tokens.authProfile?.provider ?? "oauth", chatId: tokens.authProfile?.chatId, fullName: tokens.authProfile?.fullName, username: tokens.authProfile?.username });
    } catch (reason) { setAuthError(reason instanceof Error ? reason.message : "Authentication failed"); void track("login_failed", { provider: "oauth" }); }
    finally { if (authCodeInFlight.current === code) authCodeInFlight.current = null; setAuthBusy(false); }
  };
  useEffect(() => {
    const subscription = Linking.addEventListener("url", event => { void completeAuth(event.url); });
    const webSubscription = typeof window !== "undefined" ? ((event: Event) => { const detail = (event as CustomEvent<string>).detail; if (detail) void completeAuth(detail); }) : null;
    if (webSubscription && typeof window !== "undefined") window.addEventListener("hanzideck-auth", webSubscription);
    Linking.getInitialURL().then(value => { if (value) void completeAuth(value); });
    getTokens().then(tokens => { if (!tokens) return; getAccount().then(setAccount).catch(() => clearTokens()); });
    return () => { subscription.remove(); if (webSubscription && typeof window !== "undefined") window.removeEventListener("hanzideck-auth", webSubscription); };
  }, [ready]);
  const signIn = async (provider: "google" | "telegram") => { setAuthError(''); void track("login_started", { provider }); await Linking.openURL(authUrl(provider, redirectUri())); };
  const signOut = async () => { await clearTokens(); setAccount(null); };
  useEffect(() => { if (ready) saveStore(data); }, [data, ready]);
  useEffect(() => {
    if (!ready || !account || authBusy) return;
    const snapshotKey = JSON.stringify(syncableSnapshot(data));
    if (syncedSnapshot.current === snapshotKey) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      void bootstrapStore(dataRef.current).then(merged => {
        syncedSnapshot.current = JSON.stringify(syncableSnapshot(merged));
        setData(merged);
      }).catch(() => {
        // Local-first behavior: leave the local store intact and retry on the next change.
      });
    }, 750);
    return () => { if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; } };
  }, [account, authBusy, data, ready]);
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
    const previousLanguage = data.settings.language;
    const firstSelection = !data.languageSelected;
    const request = ++switchRequest.current;
    if (data.languageSelected && data.settings.language === language && dictionaryRef.current?.language === language) {
      setDictionaryError(''); setSwitchingLanguage(null);
      return true;
    }
    setSwitchingLanguage(language); setDictionaryError(''); setDictionaryProgress(0);
    try {
      let value = await loadDictionary(language, progress => {
        if (switchRequest.current === request) setDictionaryProgress(progress);
      });
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
      void track("language_switched", { from: previousLanguage, to: language, source: firstSelection ? "onboarding" : "settings", firstTime: firstSelection });
      return true;
    } catch (reason) {
      if (switchRequest.current === request) setDictionaryError(reason instanceof Error ? reason.message : 'Dictionary download failed.');
      void track("language_switch_failed", { from: previousLanguage, to: language });
      return false;
    } finally {
      if (switchRequest.current === request) { setSwitchingLanguage(null); setDictionaryProgress(null); }
    }
  };
  const retryDictionary = () => { setDictionaryError(''); setDictionaryReload(value => value + 1); };
  const patch = (fn: (value: StoreData) => StoreData) => setData(fn);
  const setAutomaticWordAddition = (enabled: boolean, completeOnboarding = false) => {
    void track("study_mode_selected", { mode: enabled ? "automatic" : "manual", firstTime: !data.onboardingComplete });
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
    if (fresh.length) void track("words_added", { count: fresh.length });
    return fresh.length;
  };
  const makeBackup = () => createBackup(dataRef.current);
  const mergeBackup = (backup: BackupFile) => {
    const result = mergeBackupData(dataRef.current, backup);
    dataRef.current = result.data;
    setData(result.data);
    return result.summary;
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
  const value = useMemo(() => ({ data, ready, generating, error, dictionary, dictionaryLoading, dictionaryError, dictionaryProgress, switchingLanguage, account, authBusy, authError, selectLanguage, retryDictionary, importWords, patch, createBackup: makeBackup, mergeBackup, setAutomaticWordAddition, generateBatch, signIn, signOut }), [data, ready, generating, error, dictionary, dictionaryLoading, dictionaryError, dictionaryProgress, switchingLanguage, account, authBusy, authError]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export const useStore = () => useContext(StoreContext);
