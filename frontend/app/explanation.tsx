import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useStore } from '@/context';
import { explainWordOrSentence } from '@/deepseek';
import { requestExplanation } from '@/explanation-loading';
import { Text, useTranslation } from '@/i18n';
import { colors } from '@/theme';
import { explanationKey, normalizeExplanationText, type ExplanationKind } from '@/word-explanations';
import { explanationReturnPath } from '@/explanation-navigation';
import type { WordExplanation } from '@/types';

export default function ExplanationPage() {
  const params = useLocalSearchParams<{ kind?: string; text?: string; from?: string }>();
  const kind = params.kind === 'sentence' ? 'sentence' : 'word';
  const text = normalizeExplanationText(typeof params.text === 'string' ? params.text : '');
  const { data } = useStore();
  const key = explanationKey(kind, text, data.settings.language);
  return <ExplanationDetail key={key} kind={kind} text={text} cacheKey={key} returnPath={explanationReturnPath(params.from)} />;
}

function ExplanationDetail({ kind, text, cacheKey, returnPath }: { kind: ExplanationKind; text: string; cacheKey: string; returnPath: string }) {
  const { data, patch, ready } = useStore();
  const t = useTranslation();
  const language = data.settings.language;
  const cached = data.explanations?.[cacheKey];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState<Partial<WordExplanation> | null>(null);
  const fetchExplanation = async () => {
    if (!text || busy) return;
    setBusy(true); setError(''); setPartial(null);
    try {
      const explanation = await requestExplanation(cacheKey, onPartial => explainWordOrSentence(data.settings, kind, text, onPartial), preview => setPartial(preview));
      const updatedAt = Date.now();
      patch(current => ({ ...current, explanations: { ...current.explanations, [cacheKey]: { language, kind, text, explanation, updatedAt } } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not get explanation.'); }
    finally { setPartial(null); setBusy(false); }
  };
  useEffect(() => {
    if (!ready || !text || cached) return;
    let active = true;
    setBusy(true); setError(''); setPartial(null);
    void requestExplanation(cacheKey, onPartial => explainWordOrSentence(data.settings, kind, text, onPartial), preview => { if (active) setPartial(preview); })
      .then(explanation => {
        if (!active) return;
        const updatedAt = Date.now();
        patch(current => ({ ...current, explanations: { ...current.explanations, [cacheKey]: { language, kind, text, explanation, updatedAt } } }));
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not get explanation.'); })
      .finally(() => { if (active) { setPartial(null); setBusy(false); } });
    return () => { active = false; };
  }, [cacheKey, ready, !!cached]);
  const explanation = partial ?? cached?.explanation;
  const parts = Array.isArray(explanation?.parts) ? explanation.parts : [];
  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.navigate(returnPath)} style={styles.icon}><Ionicons name="arrow-back" size={25} color={colors.green} /></Pressable>
      <Text style={styles.headerTitle}>Explanation</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Refresh explanation')} disabled={busy || !text} onPress={fetchExplanation} style={styles.icon}><Ionicons name="refresh" size={24} color={busy ? '#9A9D95' : colors.green} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.hanzi}>{text}</Text>
      {explanation ? <>
        {!!explanation.pinyin && <Text style={styles.pinyin}>{explanation.pinyin}</Text>}
        {!!explanation.translation && <Text style={styles.translation}>{explanation.translation}</Text>}
        {!!explanation.summary && <Text style={styles.summary}>{explanation.summary}</Text>}
        {parts.map((part, index) => part && typeof part === 'object' ? <View key={`${part.text ?? ''}-${index}`} style={styles.card}>
          {!!part.text && <Text style={styles.part}>{part.text}{part.pinyin ? ` · ${part.pinyin}` : ''}</Text>}
          {!!part.meaning && <Text style={styles.meaning}>{part.meaning}</Text>}
          {(Array.isArray(part.characters) ? part.characters : []).map((character, characterIndex) => character && typeof character === 'object' ? <View key={`${character.hanzi ?? ''}-${characterIndex}`} style={styles.characterRow}>
            {!!character.hanzi && <Text style={styles.character}>{character.hanzi}</Text>}
            <Text style={styles.characterMeaning}>{character.pinyin ?? ''}{character.meaning ? ` · ${character.meaning}` : ''}</Text>
          </View> : null)}
        </View> : null)}
        {!!explanation.grammar && <Text style={styles.summary}>{explanation.grammar}</Text>}
      </> : null}
      {!cached && !partial && !error && ready && <ActivityIndicator accessibilityLabel={t('Loading explanation')} color={colors.green} style={{ marginTop: 20 }} />}
      {!!partial && busy && <ActivityIndicator accessibilityLabel={t('Loading explanation')} color={colors.green} style={{ marginTop: 10 }} />}
      {!!error && <Text style={styles.error}>{error} {t('Use Refresh to try again.')}</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  content: { padding: 24, paddingBottom: 48, gap: 12 },
  hanzi: { fontSize: 40, fontWeight: '700', textAlign: 'center', color: '#111' },
  pinyin: { fontSize: 19, textAlign: 'center', color: '#111' },
  translation: { fontSize: 25, fontWeight: '700', textAlign: 'center', color: '#111' },
  summary: { fontSize: 16, lineHeight: 24, color: '#444' },
  card: { backgroundColor: colors.card, padding: 17, borderRadius: 16, gap: 7, marginTop: 8 },
  part: { fontSize: 21, fontWeight: '700', color: colors.green },
  meaning: { fontSize: 16, color: '#444' },
  characterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9 },
  character: { fontSize: 26, fontWeight: '700', color: colors.green },
  characterMeaning: { fontSize: 15, flex: 1, color: '#444' },
  error: { color: '#B54747', fontSize: 15 },
});
