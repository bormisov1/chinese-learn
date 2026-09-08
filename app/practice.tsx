import { LANGUAGES, Text, TextInput, useTranslation } from "@/i18n";
import { useMemo,
  useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useStore } from "@/context";
import { evaluate, evaluateChinese, explain } from "@/deepseek";
import { Evaluation, Explanation, PracticeDirection } from "@/types";
import { colors } from "@/theme";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { copyText } from "@/clipboard";
import { finishExercise } from "@/exercise-progress";

export default function Practice() {
  const {
    data,
    patch,
    generating,
    error: generationError,
    generateBatch,
  } = useStore();
  const t = useTranslation();
  const studyLanguage = LANGUAGES.find(item => item.code === data.settings.language)?.nativeLabel ?? "English";
  const [direction, setDirection] = useState<PracticeDirection>("zh-ru");
  const [lastSentenceId, setLastSentenceId] = useState<string>();
  const [answer, setAnswer] = useState(""),
    [submittedAnswer, setSubmittedAnswer] = useState(""),
    [evaluation, setEvaluation] = useState<Evaluation>(),
    [explanation, setExplanation] = useState<Explanation>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const now = Date.now();
  const wordsById = useMemo(
    () => new Map(data.words.map((w) => [w.id, w])),
    [data.words],
  );
  const ordered = useMemo(
    () =>
      [...data.sentences].sort((a, b) => {
        const stats = (sentence: typeof a) => {
          const words = sentence.wordIds
            .map((id) => wordsById.get(id))
            .filter(Boolean);
          return {
            due: words.filter((w) => (w?.srsDueAt ?? 0) <= now).length,
            level:
              words.reduce((sum, w) => sum + (w?.srsLevel ?? 0), 0) /
              Math.max(1, words.length),
          };
        };
        const aa = stats(a),
          bb = stats(b);
        return (
          bb.due - aa.due ||
          aa.level - bb.level ||
          a.sentenceShownCount - b.sentenceShownCount ||
          (a.lastShownAt ?? 0) - (b.lastShownAt ?? 0)
        );
      }),
    [data.sentences, wordsById],
  );
  const sentence = ordered.find((s) => s.id !== lastSentenceId) ?? ordered[0];
  const dueWords = data.words.filter((w) => w.srsDueAt <= now).length;
  const practicedWords = data.words.filter(
    (w) => w.wordShownCount > 0 || w.srsCorrect + w.srsIncorrect > 0,
  ).length;

  const resetAnswer = () => {
    setAnswer("");
    setSubmittedAnswer("");
    setEvaluation(undefined);
    setExplanation(undefined);
    setError("");
  };
  const changeDirection = (value: PracticeDirection) => {
    setDirection(value);
    resetAnswer();
  };
  const run = async () => {
    if (!sentence || !answer.trim()) return;
    const trimmedAnswer = answer.trim();
    setBusy(true);
    setError("");
    try {
      const result = await (direction === "zh-ru" ? evaluate : evaluateChinese)(
        data.settings,
        sentence,
        trimmedAnswer,
      );
      setSubmittedAnswer(trimmedAnswer);
      setEvaluation(result);
      patch((d) => ({
        ...d,
        attempts: [
          ...d.attempts,
          {
            sentenceId: sentence.id,
            answer: trimmedAnswer,
            evaluation: result,
            direction,
            at: Date.now(),
          },
        ],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  };
  const help = async () => {
    if (!sentence) return;
    setBusy(true);
    setError("");
    try {
      setExplanation(await explain(data.settings, sentence, data.words));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Explanation failed");
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    if (sentence) {
      setLastSentenceId(sentence.id);
      patch((d) =>
        finishExercise(d, {
          kind: "sentence",
          sentenceId: sentence.id,
          correct: evaluation?.correct === true,
        }),
      );
    }
    resetAnswer();
    if (ordered.filter((s) => !s.sentenceShownCount).length < 10)
      generateBatch();
  };

  if (!sentence)
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow="Sentence practice"
          title="Read. Think. Translate."
          subtitle="Generate examples first to start an exercise."
        />
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>译</Text>
          <Text style={styles.emptyTitle}>
            {generating ? "Generating sentences…" : "No sentences yet"}
          </Text>
          <Text style={styles.muted}>
            {generating
              ? "DeepSeek is creating and validating a batch of 20."
              : "Import words, add your DeepSeek API key in Settings, then generate sentences."}
          </Text>
          {generationError ? (
            <Text style={styles.error}>{generationError}</Text>
          ) : null}
        </View>
        <Button
          label={generating ? "Generating…" : "Generate sentences"}
          disabled={generating || !data.words.length}
          onPress={() => generateBatch()}
        />
      </ScrollView>
    );

  const chineseFirst = direction === "zh-ru";
  return (
    <ScrollView
      style={shell.page}
      contentContainerStyle={shell.content}
      keyboardShouldPersistTaps="handled"
    >
      <Header
        eyebrow="Sentence practice"
        title="Read. Think. Translate."
        subtitle={`${dueWords} words due · ${practicedWords} of ${data.words.length} practiced`}
      />
      <View style={styles.direction}>
        <Button
          secondary={!chineseFirst}
          label={`${t("Chinese")} → ${studyLanguage}`}
          onPress={() => changeDirection("zh-ru")}
        />
        <Button
          secondary={chineseFirst}
          label={`${studyLanguage} → ${t("Chinese")}`}
          onPress={() => changeDirection("ru-zh")}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy sentence"
        onPress={() =>
          copyText(
            chineseFirst
              ? sentence.chinese.replaceAll(" ", "")
              : sentence.russian,
          )
        }
        style={styles.sentence}
      >
        <View style={styles.sentenceContent}>
          <Text style={chineseFirst ? styles.chinese : styles.russian}>
            {chineseFirst
              ? sentence.chinese.replaceAll(" ", "")
              : sentence.russian}
          </Text>
          {chineseFirst && (
            <SpeakerButton
              text={sentence.chinese}
              settings={data.settings}
              size={22}
            />
          )}
        </View>
      </Pressable>
      {!evaluation && !explanation && (
        <>
          <Text style={styles.label}>
            {chineseFirst
              ? `${t("YOUR TRANSLATION")} · ${studyLanguage}`
              : t("YOUR CHINESE TRANSLATION")}
          </Text>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            multiline
            placeholder={
              chineseFirst ? t("Enter your translation…") : "输入中文翻译…"
            }
            placeholderTextColor="#9A9D95"
            style={styles.input}
          />
          <View style={styles.actions}>
            <Button secondary label="I don't know" onPress={help} />
            <Button
              label="Check answer"
              icon="checkmark"
              disabled={!answer.trim() || busy}
              onPress={run}
            />
          </View>
        </>
      )}
      {busy && (
        <ActivityIndicator style={{ margin: 18 }} color={colors.green} />
      )}{" "}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {evaluation && (
        <View
          style={[
            styles.feedback,
            evaluation.correct ? styles.correct : styles.incorrect,
          ]}
        >
          <Text style={styles.feedbackTitle}>
            {evaluation.correct ? "✓ Correct" : "Not quite yet"}
          </Text>
          {!evaluation.correct && (
            <View style={styles.translationResult}>
              <Text style={styles.resultLabel}>YOUR TRANSLATION</Text>
              <Text style={styles.submittedAnswer}>{submittedAnswer}</Text>
            </View>
          )}
          <Text style={styles.pinyin}>{evaluation.pinyin}</Text>
          {evaluation.correction && (
            <View style={styles.audioRow}>
              <Pressable onPress={() => copyText(evaluation.correction!)}>
                <Text style={styles.correction}>{evaluation.correction}</Text>
              </Pressable>
              {!chineseFirst && (
                <SpeakerButton
                  text={evaluation.correction}
                  settings={data.settings}
                />
              )}
            </View>
          )}
          <Text style={styles.muted}>{evaluation.feedback}</Text>
        </View>
      )}
      {explanation && (
        <View style={styles.feedback}>
          <View style={styles.audioRow}>
            <Text style={styles.feedbackTitle}>Sentence guide</Text>
            <SpeakerButton text={sentence.chinese} settings={data.settings} />
          </View>
          <Text style={styles.pinyin}>{explanation.pinyin}</Text>
          <Pressable onPress={() => copyText(explanation.russian)}>
            <Text style={styles.correction}>{explanation.russian}</Text>
          </Pressable>
          {explanation.words.map((w, i) => (
            <View key={`${w.word}-${i}`} style={styles.audioRow}>
              <Text style={[styles.word, { flex: 1 }]}>
                <Text style={{ fontWeight: "800" }}>{w.word}</Text> ·{" "}
                {w.meaning}
              </Text>
              <SpeakerButton text={w.word} settings={data.settings} />
            </View>
          ))}
          <Text style={[styles.muted, { marginTop: 12 }]}>
            {explanation.grammar}
          </Text>
        </View>
      )}
      {(evaluation || explanation) && (
        <View style={styles.actions}>
          {evaluation && !explanation && (
            <Button secondary label="Explain more" onPress={help} />
          )}
          <Button label="Next" icon="arrow-forward" onPress={next} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sentenceContent: { alignItems: "center", gap: 10 },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  direction: { flexDirection: "row", gap: 8, marginBottom: 14 },
  sentence: {
    minHeight: 180,
    backgroundColor: colors.green,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  chinese: {
    color: colors.white,
    fontSize: 35,
    lineHeight: 50,
    fontWeight: "600",
    textAlign: "center",
  },
  russian: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 36,
    fontWeight: "600",
    textAlign: "center",
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 24,
    marginBottom: 9,
  },
  input: {
    minHeight: 115,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 15,
    fontSize: 18,
    color: colors.ink,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  feedback: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 17,
    padding: 19,
    marginTop: 18,
  },
  correct: { backgroundColor: "#EEF5F0", borderColor: "#C9DBCF" },
  incorrect: { backgroundColor: "#FFF4F0", borderColor: "#EDCFC5" },
  feedbackTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  translationResult: { marginTop: 14 },
  resultLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  submittedAnswer: {
    color: colors.red,
    fontSize: 18,
    marginTop: 5,
  },
  pinyin: { color: colors.green, fontSize: 16, marginTop: 12 },
  correction: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    marginVertical: 10,
  },
  muted: { color: colors.muted, lineHeight: 21 },
  word: { color: colors.ink, paddingTop: 8 },
  error: { color: colors.red, marginTop: 14 },
  empty: {
    alignItems: "center",
    padding: 35,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyIcon: { fontSize: 42, color: colors.green },
  emptyTitle: { fontSize: 19, fontWeight: "800", marginVertical: 8 },
});
