import { Text, TextInput } from "@/i18n";
import { useMemo,
  useState } from "react";
import { ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useStore } from "@/context";
import { evaluate, explain } from "@/deepseek";
import { Evaluation, Explanation, Sentence, Word } from "@/types";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { colors } from "@/theme";
import { finishExercise } from "@/exercise-progress";

type ListeningItem =
  | { kind: "word"; id: string; chinese: string; pinyin: string; russian: string; word: Word }
  | { kind: "sentence"; id: string; chinese: string; pinyin: string; russian: string; sentence: Sentence };

export default function Listening() {
  const { data, patch } = useStore();
  const items = useMemo<ListeningItem[]>(() => {
    const words: ListeningItem[] = data.words.map((word) => ({ kind: "word", id: `word:${word.id}`, chinese: word.hanzi, pinyin: word.pinyin, russian: word.russian, word }));
    const sentences: ListeningItem[] = data.settings.apiKeyValidated
      ? data.sentences.map((sentence) => ({ kind: "sentence", id: `sentence:${sentence.id}`, chinese: sentence.chinese.replaceAll(" ", ""), pinyin: sentence.pinyin, russian: sentence.russian, sentence }))
      : [];
    return [...words, ...sentences].sort((a, b) => {
      const aSeen = a.kind === "word" ? a.word.wordShownCount : a.sentence.sentenceShownCount;
      const bSeen = b.kind === "word" ? b.word.wordShownCount : b.sentence.sentenceShownCount;
      return aSeen - bSeen || a.id.localeCompare(b.id);
    });
  }, [data.words, data.sentences, data.settings.apiKeyValidated]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [explanation, setExplanation] = useState<Explanation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const item = items[position % Math.max(1, items.length)];
  const includesSentences = items.some(({ kind }) => kind === "sentence");

  if (!item) return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow="Listening practice" title="Listen. Recognize. Recall." subtitle="Import vocabulary to begin." />
    </ScrollView>
  );

  const reset = () => {
    setRevealed(false); setAnswer(""); setSubmittedAnswer("");
    setEvaluation(undefined); setExplanation(undefined); setError("");
  };
  const next = () => {
    if (item.kind === "sentence") {
      patch((current) => finishExercise(current, { kind: "sentence", sentenceId: item.sentence.id, correct: evaluation?.correct === true }));
    } else {
      patch((current) => finishExercise(current, { kind: "word", wordId: item.word.id }));
    }
    setPosition((value) => value + 1);
    reset();
  };
  const checkAnswer = async () => {
    if (item.kind !== "sentence" || !answer.trim()) return;
    const trimmedAnswer = answer.trim();
    setBusy(true); setError("");
    try {
      const result = await evaluate(data.settings, item.sentence, trimmedAnswer);
      setSubmittedAnswer(trimmedAnswer); setEvaluation(result); setRevealed(true);
      patch((current) => ({ ...current, attempts: [...current.attempts, { sentenceId: item.sentence.id, answer: trimmedAnswer, evaluation: result, direction: "zh-ru", at: Date.now() }] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation failed");
    } finally { setBusy(false); }
  };
  const showHelp = async () => {
    if (item.kind !== "sentence") return;
    setBusy(true); setError("");
    try {
      setExplanation(await explain(data.settings, item.sentence, data.words));
      setRevealed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Explanation failed");
    } finally { setBusy(false); }
  };
  const answered = Boolean(evaluation || explanation);

  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
      <Header
        eyebrow={`Listening · ${item.kind}`}
        title="Listen. Recognize. Recall."
        subtitle={`${position % items.length + 1} of ${items.length} · ${includesSentences ? "words and sentences mixed" : "words only"}`}
      />
      <Pressable
        accessibilityRole={item.kind === "word" ? "button" : undefined}
        accessibilityLabel={item.kind === "word" ? revealed ? "Hide answer" : "Reveal answer" : undefined}
        disabled={item.kind === "sentence"}
        onPress={() => setRevealed((value) => !value)}
        style={styles.card}
      >
        <SpeakerButton text={item.chinese} settings={data.settings} size={42} accessibilityLabel="Play listening prompt" />
      </Pressable>

      {item.kind === "word" && revealed && (
        <View style={styles.answer}>
          <Text style={styles.chinese}>{item.chinese}</Text>
          <Text style={styles.pinyin}>{item.pinyin}</Text>
          <Text style={styles.russian}>{item.russian}</Text>
        </View>
      )}

      {item.kind === "sentence" && !answered && (
        <>
          <Text style={styles.label}>YOUR RUSSIAN TRANSLATION</Text>
          <TextInput value={answer} onChangeText={setAnswer} multiline placeholder="Enter your translation…" placeholderTextColor="#9A9D95" style={styles.input} />
          <View style={styles.actions}>
            <Button secondary label="I don't know" disabled={busy} onPress={showHelp} />
            <Button label="Check answer" icon="checkmark" disabled={!answer.trim() || busy} onPress={checkAnswer} />
          </View>
        </>
      )}

      {busy && <ActivityIndicator style={styles.busy} color={colors.green} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {item.kind === "sentence" && evaluation && (
        <View style={[styles.feedback, evaluation.correct ? styles.correct : styles.incorrect]}>
          <Text style={styles.feedbackTitle}>{evaluation.correct ? "✓ Correct" : "Not quite yet"}</Text>
          {!evaluation.correct && (
            <View style={styles.translationResult}>
              <Text style={styles.resultLabel}>YOUR TRANSLATION</Text>
              <Text style={styles.submittedAnswer}>{submittedAnswer}</Text>
            </View>
          )}
          <Text style={styles.chinese}>{item.chinese}</Text>
          <Text style={styles.pinyin}>{evaluation.pinyin}</Text>
          {evaluation.correction ? <Text style={styles.russian}>{evaluation.correction}</Text> : null}
          <Text style={styles.muted}>{evaluation.feedback}</Text>
        </View>
      )}

      {item.kind === "sentence" && explanation && (
        <View style={styles.feedback}>
          <Text style={styles.feedbackTitle}>Sentence guide</Text>
          <Text style={styles.chinese}>{item.chinese}</Text>
          <Text style={styles.pinyin}>{explanation.pinyin}</Text>
          <Text style={styles.russian}>{explanation.russian}</Text>
          {explanation.words.map((word, index) => (
            <View key={`${word.word}-${index}`} style={styles.wordRow}>
              <Text style={styles.word}><Text style={styles.wordHanzi}>{word.word}</Text> · {word.meaning}</Text>
              <SpeakerButton text={word.word} settings={data.settings} />
            </View>
          ))}
          <Text style={styles.muted}>{explanation.grammar}</Text>
        </View>
      )}

      {item.kind === "word" && (revealed
        ? <Button label="Next" icon="arrow-forward" onPress={next} />
        : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />)}
      {item.kind === "sentence" && answered && (
        <View style={styles.actions}>
          {evaluation && !explanation ? <Button secondary label="Explain more" disabled={busy} onPress={showHelp} /> : null}
          <Button label="Next" icon="arrow-forward" onPress={next} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 230, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 24, marginBottom: 18, alignItems: "center", justifyContent: "center" },
  answer: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 22, marginBottom: 18, alignItems: "center", gap: 8 },
  chinese: { color: colors.ink, fontSize: 34, lineHeight: 46, fontWeight: "800", textAlign: "center" },
  pinyin: { color: colors.green, fontSize: 20, fontWeight: "700", textAlign: "center" },
  russian: { color: colors.ink, fontSize: 20, lineHeight: 28, textAlign: "center" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 6, marginBottom: 9 },
  input: { minHeight: 115, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 15, fontSize: 18, color: colors.ink, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  busy: { margin: 18 },
  error: { color: colors.red, marginTop: 12 },
  feedback: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20, marginTop: 18, gap: 12 },
  correct: { borderColor: colors.green }, incorrect: { borderColor: colors.coral },
  feedbackTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  translationResult: { borderLeftWidth: 3, borderLeftColor: colors.coral, paddingLeft: 12 },
  resultLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  submittedAnswer: { color: colors.ink, fontSize: 17, marginTop: 4 },
  muted: { color: colors.muted, lineHeight: 21 },
  wordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: { flex: 1, color: colors.ink }, wordHanzi: { fontWeight: "800" },
});
