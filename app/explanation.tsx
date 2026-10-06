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
  const fetchExplanation = async () => {
    if (!text || busy) return;
    setBusy(true); setError('');
    try {
      const explanation = await requestExplanation(cacheKey, () => explainWordOrSentence(data.settings, kind, text));
      const updatedAt = Date.now();
      patch(current => ({ ...current, explanations: { ...current.explanations, [cacheKey]: { language, kind, text, explanation, updatedAt } } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not get explanation.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!ready || !text || cached) return;
    let active = true;
    setBusy(true); setError('');
    void requestExplanation(cacheKey, () => explainWordOrSentence(data.settings, kind, text))
      .then(explanation => {
        if (!active) return;
        const updatedAt = Date.now();
        patch(current => ({ ...current, explanations: { ...current.explanations, [cacheKey]: { language, kind, text, explanation, updatedAt } } }));
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not get explanation.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [cacheKey, ready, !!cached]);
  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.navigate(returnPath)} style={styles.icon}><Ionicons name="arrow-back" size={25} color={colors.green} /></Pressable>
      <Text style={styles.headerTitle}>Explanation</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Refresh explanation')} disabled={busy || !text} onPress={fetchExplanation} style={styles.icon}><Ionicons name="refresh" size={24} color={busy ? '#9A9D95' : colors.green} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.hanzi}>{text}</Text>
      {cached ? <>
        <Text style={styles.pinyin}>{cached.explanation.pinyin}</Text>
        <Text style={styles.translation}>{cached.explanation.translation}</Text>
        <Text style={styles.summary}>{cached.explanation.summary}</Text>
        {cached.explanation.parts.map((part, index) => <View key={`${part.text}-${index}`} style={styles.card}>
          <Text style={styles.part}>{part.text} · {part.pinyin}</Text>
          <Text style={styles.meaning}>{part.meaning}</Text>
          {part.characters.map((character, characterIndex) => <View key={`${character.hanzi}-${characterIndex}`} style={styles.characterRow}>
            <Text style={styles.character}>{character.hanzi}</Text>
            <Text style={styles.characterMeaning}>{character.pinyin} · {character.meaning}</Text>
          </View>)}
        </View>)}
        {!!cached.explanation.grammar && <Text style={styles.summary}>{cached.explanation.grammar}</Text>}
      </> : null}
      {!cached && !error && ready && <ActivityIndicator accessibilityLabel={t('Loading explanation')} color={colors.green} style={{ marginTop: 20 }} />}
      {!!error && <Text style={styles.error}>{error} {t('Use Refresh to try again.')}</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.green },
  content: { padding: 24, paddingBottom: 48, gap: 12 },
  hanzi: { fontSize: 40, fontWeight: '700', textAlign: 'center', color: colors.green },
  pinyin: { fontSize: 19, textAlign: 'center', color: colors.green },
  translation: { fontSize: 25, fontWeight: '700', textAlign: 'center', color: colors.green },
  summary: { fontSize: 16, lineHeight: 24, color: '#444' },
  card: { backgroundColor: colors.card, padding: 17, borderRadius: 16, gap: 7, marginTop: 8 },
  part: { fontSize: 21, fontWeight: '700', color: colors.green },
  meaning: { fontSize: 16, color: '#444' },
  characterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9 },
  character: { fontSize: 26, fontWeight: '700', color: colors.green },
  characterMeaning: { fontSize: 15, flex: 1, color: '#444' },
  error: { color: '#B54747', fontSize: 15 },
});
