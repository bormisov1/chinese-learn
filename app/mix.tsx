import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useStore } from "@/context";
import { evaluate, evaluateChinese, explain } from "@/deepseek";
import { finishExercise } from "@/exercise-progress";
import { colors } from "@/theme";
import { Evaluation, Explanation, PracticeDirection, Sentence, Word } from "@/types";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { copyText } from "@/clipboard";

type MixItem =
  | { id: string; mode: "word"; word: Word }
  | { id: string; mode: "sentence"; sentence: Sentence }
  | { id: string; mode: "listening"; source: Word | Sentence; sourceKind: "word" | "sentence" };
type PrioritizedItem = MixItem & { priority: number };

function shuffledPriorityQueue(items: PrioritizedItem[]) {
  const groups = new Map<number, PrioritizedItem[]>();
  items.forEach((item) => groups.set(item.priority, [...(groups.get(item.priority) ?? []), item]));
  return [...groups.keys()].sort((a, b) => a - b).flatMap((priority) => {
    const group = [...groups.get(priority)!];
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [group[index], group[swap]] = [group[swap], group[index]];
    }
    return group.map(({ id }) => id);
  });
}

function reconcileQueue(queue: string[], items: PrioritizedItem[]) {
  const valid = new Set(items.map(({ id }) => id));
  const retained = queue.filter((id, index) => valid.has(id) && queue.indexOf(id) === index);
  const retainedIds = new Set(retained);
  return [...retained, ...shuffledPriorityQueue(items.filter(({ id }) => !retainedIds.has(id)))];
}

const isSentence = (source: Word | Sentence): source is Sentence => "chinese" in source;

export default function Mix() {
  const { data, patch } = useStore();
  const candidates = useMemo<PrioritizedItem[]>(() => [
    ...data.words.flatMap((word): PrioritizedItem[] => [
      { id: `word:${word.id}`, mode: "word", word, priority: word.wordShownCount },
      { id: `listening:word:${word.id}`, mode: "listening", source: word, sourceKind: "word", priority: word.wordShownCount },
    ]),
    ...data.sentences.flatMap((sentence): PrioritizedItem[] => [
      { id: `sentence:${sentence.id}`, mode: "sentence", sentence, priority: sentence.sentenceShownCount },
      { id: `listening:sentence:${sentence.id}`, mode: "listening", source: sentence, sourceKind: "sentence", priority: sentence.sentenceShownCount },
    ]),
  ], [data.words, data.sentences]);
  const queue = useMemo(() => reconcileQueue(data.mixQueue, candidates), [data.mixQueue, candidates]);
  const itemsById = useMemo(() => new Map(candidates.map((entry) => [entry.id, entry])), [candidates]);
  const position = Math.min(data.mixPosition, Math.max(0, queue.length - 1));
  const item = itemsById.get(queue[position]);
  const [revealed, setRevealed] = useState(false);
  const [direction, setDirection] = useState<PracticeDirection>("zh-ru");
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const changed = queue.length !== data.mixQueue.length || queue.some((id, index) => id !== data.mixQueue[index]);
    if (queue.length && (changed || position !== data.mixPosition))
      patch((current) => ({ ...current, mixQueue: queue, mixPosition: position }));
  }, [queue.join("|"), position]);

  if (!item) return <ScrollView style={shell.page} contentContainerStyle={shell.content}><Header eyebrow="Mixed practice" title="Everything in one round." subtitle="Import vocabulary to begin." /></ScrollView>;

  const sentence = item.mode === "sentence" ? item.sentence : item.mode === "listening" && item.sourceKind === "sentence" ? item.source as Sentence : undefined;
  const word = item.mode === "word" ? item.word : undefined;
  const listening = item.mode === "listening";
  const chinese = item.mode === "word" ? item.word.hanzi : item.mode === "sentence" ? item.sentence.chinese.replaceAll(" ", "") : isSentence(item.source) ? item.source.chinese.replaceAll(" ", "") : item.source.hanzi;
  const pinyin = item.mode === "word" ? item.word.pinyin : item.mode === "sentence" ? item.sentence.pinyin : item.source.pinyin;
  const russian = item.mode === "word" ? item.word.russian : item.mode === "sentence" ? item.sentence.russian : item.source.russian;
  const chineseFirst = listening || direction === "zh-ru";
  const answered = Boolean(evaluation || explanation);
  const reset = () => { setRevealed(false); setAnswer(""); setSubmittedAnswer(""); setEvaluation(undefined); setExplanation(undefined); setError(""); };
  const advance = (completion?: Parameters<typeof finishExercise>[1]) => {
    patch((current) => {
      const progressed = completion ? finishExercise(current, completion) : current;
      const atEnd = position + 1 >= queue.length;
      // An empty persisted queue makes the next render rebuild it from the
      // just-updated counters, then the effect stores that exact order.
      return { ...progressed, mixQueue: atEnd ? [] : queue, mixPosition: atEnd ? 0 : position + 1 };
    });
    reset();
  };
  const checkAnswer = async () => {
    if (!sentence || !answer.trim()) return;
    const trimmed = answer.trim(); setBusy(true); setError("");
    try {
      const result = await (chineseFirst ? evaluate : evaluateChinese)(data.settings, sentence, trimmed);
      setSubmittedAnswer(trimmed); setEvaluation(result); setRevealed(true);
      patch((current) => ({ ...current, attempts: [...current.attempts, { sentenceId: sentence.id, answer: trimmed, evaluation: result, direction: listening ? "zh-ru" : direction, at: Date.now() }] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evaluation failed"); }
    finally { setBusy(false); }
  };
  const showHelp = async () => {
    if (!sentence) return;
    setBusy(true); setError("");
    try { setExplanation(await explain(data.settings, sentence, data.words)); setRevealed(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Explanation failed"); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
      <Header eyebrow={`Mix · ${item.mode}${listening ? ` · ${item.sourceKind}` : ""}`} title="Everything in one round." subtitle={`${position + 1} of ${queue.length} · words, sentences, and listening`} />
      {sentence && !listening && !answered && <View style={styles.direction}>
        <Button secondary={!chineseFirst} label="Chinese → Russian" onPress={() => { setDirection("zh-ru"); reset(); }} />
        <Button secondary={chineseFirst} label="Russian → Chinese" onPress={() => { setDirection("ru-zh"); reset(); }} />
      </View>}
      <Pressable accessibilityRole={word || (listening && !sentence) ? "button" : undefined} accessibilityLabel={word || (listening && !sentence) ? revealed ? "Hide answer" : "Reveal answer" : undefined} disabled={Boolean(sentence)} onPress={() => setRevealed((value) => !value)} style={[styles.card, sentence && !listening && styles.sentenceCard]}>
        <Text style={styles.side}>{item.mode.toUpperCase()}</Text>
        {listening ? <SpeakerButton text={chinese} settings={data.settings} size={42} accessibilityLabel="Play listening prompt" /> : <View style={styles.centered}>
          <Pressable onPress={() => copyText(sentence && chineseFirst ? chinese : russian)}><Text style={sentence && chineseFirst ? styles.sentenceChinese : styles.prompt}>{sentence && chineseFirst ? chinese : russian}</Text></Pressable>
          {sentence && chineseFirst && <SpeakerButton text={chinese} settings={data.settings} size={22} />}
        </View>}
        {revealed && !sentence && <View style={styles.answer}><Text style={styles.chinese}>{chinese}</Text><Text style={styles.pinyin}>{pinyin}</Text><Text style={styles.translation}>{russian}</Text></View>}
      </Pressable>
      {sentence && !answered && <><Text style={styles.label}>{chineseFirst ? "YOUR RUSSIAN TRANSLATION" : "ВАШ ПЕРЕВОД НА КИТАЙСКИЙ"}</Text><TextInput value={answer} onChangeText={setAnswer} multiline placeholder={chineseFirst ? "Введите перевод на русском…" : "输入中文翻译…"} placeholderTextColor="#9A9D95" style={styles.input} /><View style={styles.actions}><Button secondary label="I don't know" disabled={busy} onPress={showHelp} /><Button label="Check answer" icon="checkmark" disabled={!answer.trim() || busy} onPress={checkAnswer} /></View></>}
      {busy && <ActivityIndicator style={styles.busy} color={colors.green} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sentence && evaluation && <View style={[styles.feedback, evaluation.correct ? styles.correct : styles.incorrect]}><Text style={styles.feedbackTitle}>{evaluation.correct ? "✓ Correct" : "Not quite yet"}</Text>{!evaluation.correct && <View style={styles.translationResult}><Text style={styles.resultLabel}>YOUR TRANSLATION</Text><Text style={styles.submittedAnswer}>{submittedAnswer}</Text></View>}{listening && <Text style={styles.chinese}>{chinese}</Text>}<Text style={styles.pinyin}>{evaluation.pinyin}</Text>{evaluation.correction ? <Text style={styles.correction}>{evaluation.correction}</Text> : null}<Text style={styles.muted}>{evaluation.feedback}</Text></View>}
      {sentence && explanation && <View style={styles.feedback}><View style={styles.audioRow}><Text style={styles.feedbackTitle}>Sentence guide</Text><SpeakerButton text={chinese} settings={data.settings} /></View><Text style={styles.chinese}>{chinese}</Text><Text style={styles.pinyin}>{explanation.pinyin}</Text><Text style={styles.correction}>{explanation.russian}</Text>{explanation.words.map((entry, index) => <View key={`${entry.word}-${index}`} style={styles.audioRow}><Text style={styles.word}><Text style={styles.wordHanzi}>{entry.word}</Text> · {entry.meaning}</Text><SpeakerButton text={entry.word} settings={data.settings} /></View>)}<Text style={styles.muted}>{explanation.grammar}</Text></View>}
      {sentence && answered && <View style={styles.actions}>{evaluation && !explanation ? <Button secondary label="Explain more" disabled={busy} onPress={showHelp} /> : null}<Button label="Next" icon="arrow-forward" onPress={() => advance({ kind: "sentence", sentenceId: sentence.id, correct: evaluation?.correct === true })} /></View>}
      {word && (revealed ? <View style={styles.actions}><Button secondary label="I don't know" onPress={() => advance({ kind: "card", wordId: word.id, correct: false, round: data.cardRound })} /><Button label="I know" icon="checkmark" onPress={() => advance({ kind: "card", wordId: word.id, correct: true, round: data.cardRound })} /></View> : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />)}
      {listening && !sentence && (revealed ? <Button label="Next" icon="arrow-forward" onPress={() => advance({ kind: "word", wordId: (item.source as Word).id })} /> : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 230, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 24, marginBottom: 18, alignItems: "center", justifyContent: "center" },
  sentenceCard: { minHeight: 180, backgroundColor: colors.green, borderWidth: 0 }, centered: { alignItems: "center", gap: 10 }, direction: { flexDirection: "row", gap: 8, marginBottom: 14 },
  side: { color: colors.coral, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 20 }, prompt: { color: colors.ink, fontSize: 27, lineHeight: 38, fontWeight: "700", textAlign: "center" }, sentenceChinese: { color: colors.white, fontSize: 35, lineHeight: 50, fontWeight: "600", textAlign: "center" },
  chinese: { color: colors.ink, fontSize: 34, lineHeight: 46, fontWeight: "800", textAlign: "center" }, answer: { width: "100%", borderTopWidth: 1, borderTopColor: colors.line, marginTop: 26, paddingTop: 22, alignItems: "center", gap: 8 }, pinyin: { color: colors.green, fontSize: 20, fontWeight: "700", textAlign: "center" }, translation: { color: colors.ink, fontSize: 20, lineHeight: 28, textAlign: "center" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 6, marginBottom: 9 }, input: { minHeight: 115, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 15, fontSize: 18, color: colors.ink, textAlignVertical: "top" }, actions: { flexDirection: "row", gap: 8, marginTop: 14 }, busy: { margin: 18 }, error: { color: colors.red, marginTop: 12 },
  feedback: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20, marginTop: 18, gap: 12 }, correct: { borderColor: colors.green }, incorrect: { borderColor: colors.coral }, feedbackTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" }, translationResult: { borderLeftWidth: 3, borderLeftColor: colors.coral, paddingLeft: 12 }, resultLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, submittedAnswer: { color: colors.red, fontSize: 17, marginTop: 4 }, correction: { color: colors.ink, fontSize: 18, fontWeight: "700" }, muted: { color: colors.muted, lineHeight: 21 }, audioRow: { flexDirection: "row", alignItems: "center", gap: 8 }, word: { flex: 1, color: colors.ink }, wordHanzi: { fontWeight: "800" },
});
