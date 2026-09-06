import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useStore } from "@/context";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { colors } from "@/theme";
import { evaluate, evaluateChinese } from "@/deepseek";
import { Evaluation, PracticeDirection, Sentence } from "@/types";

type Mode = "word" | "sentence" | "listening";
type MixItem = { id: string; mode: Mode; chinese: string; pinyin: string; russian: string; sentence?: Sentence };

export default function Mix() {
  const { data, patch } = useStore();
  const items = useMemo<MixItem[]>(() => {
    const words = [...data.words].sort((a, b) => a.wordShownCount - b.wordShownCount);
    const sentences = [...data.sentences].sort((a, b) => a.sentenceShownCount - b.sentenceShownCount);
    const count = Math.max(words.length, sentences.length);
    const mixed: MixItem[] = [];
    for (let index = 0; index < count; index += 1) {
      const word = words[index % Math.max(1, words.length)];
      const sentence = sentences[index % Math.max(1, sentences.length)];
      if (word) mixed.push({ id: `word:${word.id}`, mode: "word", chinese: word.hanzi, pinyin: word.pinyin, russian: word.russian });
      if (sentence) mixed.push({ id: `sentence:${sentence.id}`, mode: "sentence", chinese: sentence.chinese.replaceAll(" ", ""), pinyin: sentence.pinyin, russian: sentence.russian, sentence });
      const listeningSource = index % 2 === 0 ? sentence : word;
      if (listeningSource) mixed.push({
        id: `listening:${listeningSource.id}`,
        mode: "listening",
        chinese: "hanzi" in listeningSource ? listeningSource.hanzi : listeningSource.chinese.replaceAll(" ", ""),
        pinyin: listeningSource.pinyin,
        russian: listeningSource.russian,
        sentence: "hanzi" in listeningSource ? undefined : listeningSource,
      });
    }
    return mixed;
  }, [data.words, data.sentences]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [direction, setDirection] = useState<PracticeDirection>("zh-ru");
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const item = items[position % Math.max(1, items.length)];

  if (!item) return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow="Mixed practice" title="Everything in one round." subtitle="Import vocabulary to begin." />
    </ScrollView>
  );

  const listening = item.mode === "listening";
  const sentence = item.sentence;
  const chineseFirst = listening || direction === "zh-ru";
  const resetAnswer = () => {
    setAnswer("");
    setEvaluation(undefined);
    setError("");
    setRevealed(false);
  };
  const changeDirection = (value: PracticeDirection) => {
    setDirection(value);
    resetAnswer();
  };
  const checkSentence = async () => {
    if (!sentence || !answer.trim()) return;
    const trimmedAnswer = answer.trim();
    setBusy(true);
    setError("");
    try {
      const result = await (chineseFirst ? evaluate : evaluateChinese)(data.settings, sentence, trimmedAnswer);
      setEvaluation(result);
      setRevealed(true);
      patch((current) => ({
        ...current,
        attempts: [...current.attempts, { sentenceId: sentence.id, answer: trimmedAnswer, evaluation: result, direction, at: Date.now() }],
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  };
  const next = () => { setPosition((value) => value + 1); resetAnswer(); };
  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow={`Mix · ${item.mode}`} title="Everything in one round." subtitle={`${position % items.length + 1} of ${items.length} · words, sentences, and listening`} />
      {sentence && !listening ? (
        <View style={styles.direction}>
          <Button secondary={!chineseFirst} label="Chinese → Russian" onPress={() => changeDirection("zh-ru")} />
          <Button secondary={chineseFirst} label="Russian → Chinese" onPress={() => changeDirection("ru-zh")} />
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.side}>{item.mode.toUpperCase()}</Text>
        {listening ? (
          <View style={styles.listenRow}>
            <SpeakerButton text={item.chinese} settings={data.settings} size={42} accessibilityLabel="Play listening prompt" />
          </View>
        ) : (
          <>
            <Text style={sentence && chineseFirst ? styles.chinese : styles.prompt}>
              {sentence && chineseFirst ? item.chinese : item.russian}
            </Text>
            {sentence && chineseFirst ? <SpeakerButton text={item.chinese} settings={data.settings} size={22} /> : null}
          </>
        )}
        {revealed ? (
          <View style={styles.answer}>
            {listening || (!sentence || !chineseFirst) ? <Text style={styles.chinese}>{item.chinese}</Text> : null}
            <Text style={styles.pinyin}>{item.pinyin}</Text>
            {listening || (sentence && chineseFirst) ? <Text style={styles.translation}>{item.russian}</Text> : null}
          </View>
        ) : !sentence ? <Text style={styles.hint}>Answer hidden until you reveal it</Text> : null}
      </View>
      {sentence ? (
        <>
          <Text style={styles.label}>{chineseFirst ? "YOUR RUSSIAN TRANSLATION" : "ВАШ ПЕРЕВОД НА КИТАЙСКИЙ"}</Text>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            editable={!evaluation && !busy}
            multiline
            placeholder={chineseFirst ? "Введите перевод на русском…" : "输入中文翻译…"}
            placeholderTextColor="#9A9D95"
            style={styles.input}
          />
          {busy ? <ActivityIndicator style={styles.busy} color={colors.green} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {evaluation ? (
            <View style={[styles.feedback, evaluation.correct ? styles.correct : styles.incorrect]}>
              <Text style={styles.feedbackTitle}>{evaluation.correct ? "✓  Correct" : "Not quite yet"}</Text>
              {evaluation.correction ? <Text style={styles.correction}>{evaluation.correction}</Text> : null}
              <Text style={styles.translation}>{evaluation.feedback}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {revealed
              ? <Button label="Next mixed card" icon="arrow-forward" onPress={next} />
              : <>
                  <Button secondary label="I don't know" onPress={() => setRevealed(true)} />
                  <Button label="Check answer" icon="checkmark" disabled={!answer.trim() || busy} onPress={checkSentence} />
                </>}
          </View>
        </>
      ) : revealed
        ? <Button label="Next mixed card" icon="arrow-forward" onPress={next} />
        : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 340, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 24, marginBottom: 18, alignItems: "center", justifyContent: "center" },
  direction: { flexDirection: "row", gap: 8, marginBottom: 14 },
  side: { color: colors.coral, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 20 },
  prompt: { color: colors.ink, fontSize: 27, lineHeight: 38, fontWeight: "700", textAlign: "center" },
  chinese: { color: colors.ink, fontSize: 40, lineHeight: 54, fontWeight: "800", textAlign: "center" },
  listenRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  hint: { color: colors.muted, marginTop: 24, fontSize: 14 },
  answer: { width: "100%", borderTopWidth: 1, borderTopColor: colors.line, marginTop: 26, paddingTop: 22, alignItems: "center", gap: 8 },
  pinyin: { color: colors.green, fontSize: 20, fontWeight: "700", textAlign: "center" },
  translation: { color: colors.ink, fontSize: 20, lineHeight: 28, textAlign: "center" },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 9 },
  input: { minHeight: 115, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 15, fontSize: 18, color: colors.ink, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  busy: { margin: 18 },
  error: { color: colors.red, marginTop: 14 },
  feedback: { borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 19, marginTop: 18 },
  correct: { backgroundColor: "#EEF5F0", borderColor: "#C9DBCF" },
  incorrect: { backgroundColor: "#FFF4F0", borderColor: "#EDCFC5" },
  feedbackTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", marginBottom: 10 },
  correction: { color: colors.ink, fontSize: 18, fontWeight: "700", marginBottom: 10 },
});
