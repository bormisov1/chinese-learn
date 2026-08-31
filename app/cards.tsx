import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/context';
import { colors } from '@/theme';
import { Button, Header, shell } from '@/ui';
import { Sentence } from '@/types';
import { copyText } from '@/clipboard';

const DAY = 86_400_000;
const intervals = [1, 3, 7, 14, 30];
type Phase = 'ready' | 'studying' | 'complete';

export default function Cards() {
  const { data, patch, generating, generateBatch } = useStore();
  const [roundNumber, setRoundNumber] = useState(1), [roundIds, setRoundIds] = useState<string[]>([]), [position, setPosition] = useState(0), [phase, setPhase] = useState<Phase>('ready'), [flipped, setFlipped] = useState(false), [mistakeIds, setMistakeIds] = useState<string[]>([]);
  const total = data.words.length;
  const orderedWords = useMemo(() => { const now = Date.now(); return [...data.words].sort((a, b) => Number(a.cardSrsDueAt > now) - Number(b.cardSrsDueAt > now) || a.cardSrsLevel - b.cardSrsLevel || a.cardSrsDueAt - b.cardSrsDueAt || a.createdAt - b.createdAt); }, [data.words]);
  const upcoming = orderedWords.slice(0, 10);
  const roundWords = roundIds.map(id => data.words.find(w => w.id === id)).filter(Boolean) as typeof data.words;
  const word = roundWords[position];
  const examples = useMemo(() => word ? (data.wordSentenceIndex[word.id] ?? []).map(id => data.sentences.find(s => s.id === id)).filter(Boolean).slice(0, 3) : [], [data, word]);
  useEffect(() => { if (phase === 'studying' && word && examples.length < 3 && data.settings.apiKey) generateBatch(word); }, [phase, word?.id]);

  if (!total) return <ScrollView style={shell.page} contentContainerStyle={shell.content}><Header eyebrow="Recall practice" title="Flashcards" subtitle="Import vocabulary to begin."/><Button label="Go to Import" onPress={() => {}} disabled/></ScrollView>;

  const begin = (words: typeof data.words) => { setRoundIds(words.map(w => w.id)); setPosition(0); setMistakeIds([]); setFlipped(false); setPhase('studying'); };
  const startRound = () => begin(upcoming);
  const startNextRound = () => { setRoundNumber(value => value + 1); begin(orderedWords.slice(0, 10)); };
  const grade = (correct: boolean) => {
    if (!word) return;
    const reviewedAt = Date.now();
    patch(d => ({ ...d, words: d.words.map(w => {
      if (w.id !== word.id) return w;
      const nextLevel = correct ? Math.min(5, w.cardSrsLevel + 1) : 0;
      return { ...w, cardSrsLevel: nextLevel, cardSrsCorrect: w.cardSrsCorrect + (correct ? 1 : 0), cardSrsIncorrect: w.cardSrsIncorrect + (correct ? 0 : 1), cardSrsDueAt: correct ? reviewedAt + intervals[nextLevel - 1] * DAY : reviewedAt };
    }) }));
    if (!correct) setMistakeIds(ids => [...ids, word.id]);
    if (position + 1 === roundWords.length) setPhase('complete');
    else setPosition(p => p + 1);
    setFlipped(false);
  };

  if (phase === 'ready') return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
    <Header eyebrow={`Round ${roundNumber}`} title="Ready for a card round?" subtitle={`${upcoming.length} cards · lowest SRS first`}/>
    <View style={styles.roundPanel}><Text style={styles.roundIcon}>卡</Text><Text style={styles.roundTitle}>Round {roundNumber}</Text><Text style={styles.roundText}>Recall each word, reveal the answer, then mark yourself Again or Correct.</Text></View>
    <Button label={`Start ${upcoming.length}-card round`} icon="play" onPress={startRound}/>
  </ScrollView>;

  if (phase === 'complete') {
    const mistaken = mistakeIds.map(id => data.words.find(w => w.id === id)).filter(Boolean);
    return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow={`Round ${roundNumber} complete`} title={mistaken.length ? `${mistaken.length} to review` : 'Perfect round!'} subtitle={`${roundWords.length - mistaken.length} correct · ${mistaken.length} mistaken`}/>
      <View style={styles.results}>{mistaken.length ? <><Text style={styles.resultsTitle}>MISTAKEN WORDS</Text>{mistaken.map(w => <View key={w!.id} style={styles.mistake}><Pressable onPress={() => copyText(w!.hanzi)}><Text style={styles.mistakeHanzi}>{w!.hanzi}</Text></Pressable><View style={{ flex: 1 }}><Text style={styles.mistakePinyin}>{w!.pinyin}</Text><Text style={styles.mistakeRussian}>{w!.russian}</Text></View></View>)}</> : <><Text style={styles.success}>✓</Text><Text style={styles.roundText}>No mistaken words this round.</Text></>}</View>
      <Button label="Start next SRS round" icon="play" onPress={startNextRound}/>
    </ScrollView>;
  }

  return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
    <Header eyebrow={`Round ${roundNumber} · Card ${position + 1} of ${roundWords.length}`} title="Flashcards" subtitle={`Card SRS level ${word.cardSrsLevel} · ${mistakeIds.length} mistaken this round`}/>
    <View style={styles.progress}><View style={[styles.fill, { width: `${((position + 1) / roundWords.length) * 100}%` }]}/></View>
    <Pressable style={[styles.card, flipped && styles.back]} onPress={() => setFlipped(true)}>{!flipped ? <><Text style={styles.side}>RUSSIAN</Text><Text style={styles.question}>{word.russian}</Text><Text style={styles.hint}>Tap to reveal</Text></> : <><Pressable onPress={() => copyText(word.hanzi)}><Text style={styles.hanzi}>{word.hanzi}</Text></Pressable><Text style={styles.pinyin}>{word.pinyin}</Text><View style={styles.rule}/><Text style={styles.side}>EXAMPLES</Text>{examples.length ? <View style={styles.examples}>{examples.map(s => <ExampleRow key={s!.id} sentence={s!}/>)}</View> : <Text style={styles.waiting}>{generating ? 'Generating examples…' : 'No examples yet'}</Text>}</>}</Pressable>
    <View style={styles.controls}>{flipped ? <><Button secondary label="Again" icon="close" onPress={() => grade(false)}/><Button label="Correct" icon="checkmark" onPress={() => grade(true)}/></> : <Button label="Reveal answer" icon="eye-outline" onPress={() => setFlipped(true)}/>}</View>
  </ScrollView>;
}

function ExampleRow({ sentence }: { sentence: Sentence }) {
  const [revealed, setRevealed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${sentence.chinese.replaceAll(' ', '')}. Copy sentence`} onHoverIn={() => setRevealed(true)} onHoverOut={() => setRevealed(false)} onPress={() => { setRevealed(v => !v); copyText(sentence.chinese.replaceAll(' ', '')); }} style={styles.exampleRow}>
    <Text style={styles.example}>{sentence.chinese.replaceAll(' ', '')}</Text>
    <View style={[styles.exampleHelp, !revealed && styles.hidden]}><Text style={styles.examplePinyin}>{sentence.pinyin}</Text><Text style={styles.exampleRussian}>{sentence.russian}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({ roundPanel: { minHeight: 280, marginBottom: 16, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 30, alignItems: 'center', justifyContent: 'center' }, roundIcon: { fontSize: 54, color: colors.green }, roundTitle: { color: colors.ink, fontSize: 25, fontWeight: '800', marginTop: 12 }, roundText: { color: colors.muted, lineHeight: 22, textAlign: 'center', marginTop: 10 }, results: { marginBottom: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 18 }, resultsTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8 }, mistake: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }, mistakeHanzi: { width: 70, color: colors.ink, fontSize: 30, fontWeight: '800' }, mistakePinyin: { color: colors.green, fontSize: 16, fontWeight: '700' }, mistakeRussian: { color: colors.muted, marginTop: 4 }, success: { color: colors.green, fontSize: 50, fontWeight: '800', textAlign: 'center' }, progress: { height: 5, backgroundColor: colors.line, borderRadius: 4, marginBottom: 20, overflow: 'hidden' }, fill: { height: 5, backgroundColor: colors.coral }, card: { minHeight: 410, borderRadius: 25, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#36392F', shadowOpacity: .08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, back: { justifyContent: 'flex-start', paddingTop: 50 }, side: { fontSize: 11, color: colors.muted, fontWeight: '800', letterSpacing: 1.8 }, question: { fontSize: 31, fontWeight: '700', color: colors.ink, textAlign: 'center', marginTop: 20 }, hint: { position: 'absolute', bottom: 24, color: colors.muted, fontSize: 13 }, hanzi: { fontSize: 66, fontWeight: '700', color: colors.ink }, pinyin: { fontSize: 20, color: colors.green, marginTop: 6 }, rule: { height: 1, width: '100%', backgroundColor: colors.line, marginVertical: 27 }, examples: { width: '100%', marginTop: 8 }, exampleRow: { width: '100%', minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 8 }, example: { flex: 1, fontSize: 21, color: colors.ink, textAlign: 'right' }, exampleHelp: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 18 }, hidden: { opacity: 0 }, examplePinyin: { color: colors.green, fontSize: 14, fontWeight: '700' }, exampleRussian: { color: colors.muted, fontSize: 13, marginTop: 3 }, waiting: { color: colors.muted, marginTop: 20 }, controls: { flexDirection: 'row', gap: 10, marginTop: 16 } });
