import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useStore } from "@/context";
import { colors } from "@/theme";
import { Button, Header, HskBadge, shell, SpeakerButton } from "@/ui";
import { Sentence, Settings, Word } from "@/types";
import { copyText } from "@/clipboard";
import {
  ACTIVE_CARD_LIMIT,
  CARD_GRADUATION_LEVEL,
  CARD_ROUND_SIZE,
  selectRound,
} from "@/card-srs";
import { finishExercise } from "@/exercise-progress";

type Phase = "ready" | "studying" | "celebrating" | "complete";
type Graduation = { learned: Word; replacement?: Word };

export default function Cards() {
  const { data, patch, generating, generateBatch } = useStore();
  const [studyRound, setStudyRound] = useState(data.cardRound + 1),
    [roundIds, setRoundIds] = useState<string[]>([]),
    [position, setPosition] = useState(0),
    [phase, setPhase] = useState<Phase>("ready"),
    [flipped, setFlipped] = useState(false),
    [revealed, setRevealed] = useState(false),
    [mistakeIds, setMistakeIds] = useState<string[]>([]),
    [graduations, setGraduations] = useState<Graduation[]>([]),
    [roundEndsAfterCelebration, setRoundEndsAfterCelebration] = useState(false);
  const total = data.words.length;
  const upcoming = useMemo(
    () => selectRound(data.words, data.cardRound + 1),
    [data.words, data.cardRound],
  );
  const activeCount = data.words.filter((item) => item.cardActive).length;
  const roundWords = roundIds
    .map((id) => data.words.find((w) => w.id === id))
    .filter(Boolean) as typeof data.words;
  const word = roundWords[position];
  const examples = useMemo(
    () =>
      word
        ? (data.wordSentenceIndex[word.id] ?? [])
            .map((id) => data.sentences.find((s) => s.id === id))
            .filter(Boolean)
            .slice(0, 3)
        : [],
    [data, word],
  );
  useEffect(() => {
    if (
      phase === "studying" &&
      word &&
      examples.length < 3 &&
      data.settings.apiKey
    )
      generateBatch(word);
  }, [phase, word?.id]);

  if (!total)
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow="Recall practice"
          title="Flashcards"
          subtitle="Import vocabulary to begin."
        />
        <Button label="Go to Import" onPress={() => {}} disabled />
      </ScrollView>
    );

  const begin = (words: typeof data.words, round: number) => {
    setStudyRound(round);
    patch((d) => ({ ...d, cardRound: Math.max(d.cardRound, round) }));
    setRoundIds(words.map((w) => w.id));
    setPosition(0);
    setMistakeIds([]);
    setGraduations([]);
    setRoundEndsAfterCelebration(false);
    setFlipped(false);
    setRevealed(false);
    setPhase("studying");
  };
  const startRound = () => begin(upcoming, data.cardRound + 1);
  const startNextRound = () => {
    const nextRound = data.cardRound + 1;
    begin(selectRound(data.words, nextRound), nextRound);
  };
  const grade = (correct: boolean) => {
    if (!word) return;
    const reviewedAt = Date.now();
    const updatedWords = finishExercise(
      data,
      { kind: "card", wordId: word.id, correct, round: studyRound },
      reviewedAt,
    ).words;
    patch((d) =>
      finishExercise(
        d,
        { kind: "card", wordId: word.id, correct, round: studyRound },
        reviewedAt,
      ),
    );
    if (!correct) setMistakeIds((ids) => [...ids, word.id]);
    const learned = updatedWords.find(
      (item) => item.id === word.id && word.cardActive && !item.cardActive,
    );
    const replacement = updatedWords.find(
      (item) =>
        item.id !== word.id &&
        item.cardActive &&
        !data.words.find((before) => before.id === item.id)?.cardActive,
    );
    const roundComplete = position + 1 === roundWords.length;
    if (learned) {
      setGraduations((items) => [...items, { learned, replacement }]);
      setRoundEndsAfterCelebration(roundComplete);
      setPhase("celebrating");
    } else if (roundComplete) setPhase("complete");
    else setPosition((p) => p + 1);
    setFlipped(false);
    setRevealed(false);
  };
  const continueAfterCelebration = () => {
    if (roundEndsAfterCelebration) setPhase("complete");
    else {
      setPosition((p) => p + 1);
      setPhase("studying");
    }
    setRoundEndsAfterCelebration(false);
  };

  if (phase === "ready")
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow={`Round ${data.cardRound + 1}`}
          title="Ready for a card round?"
          subtitle={`${upcoming.length} of ${CARD_ROUND_SIZE} cards · ${activeCount} of ${ACTIVE_CARD_LIMIT} active`}
        />
        <View style={styles.roundPanel}>
          <Text style={styles.roundIcon}>卡</Text>
          <Text style={styles.roundTitle}>Round {data.cardRound + 1}</Text>
          <Text style={styles.roundText}>
            Correct cards skip the next round. Three correct appearances move
            a word to retention review and bring in another deck word.
          </Text>
        </View>
        <Button
          label={`Start ${upcoming.length}-card round`}
          icon="play"
          onPress={startRound}
        />
      </ScrollView>
    );

  if (phase === "celebrating") {
    const graduation = graduations[graduations.length - 1];
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow={`Round ${studyRound} · Milestone`}
          title="Word learned!"
          subtitle="A word graduated from your active card pool."
        />
        <GraduationCelebration
          graduation={graduation}
          settings={data.settings}
        />
        <Button
          label={roundEndsAfterCelebration ? "See round results" : "Continue round"}
          icon="arrow-forward"
          onPress={continueAfterCelebration}
        />
      </ScrollView>
    );
  }

  if (phase === "complete") {
    const mistaken = mistakeIds
      .map((id) => data.words.find((w) => w.id === id))
      .filter(Boolean);
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow={`Round ${studyRound} complete`}
          title={
            mistaken.length ? `${mistaken.length} to review` : "Perfect round!"
          }
          subtitle={`${roundWords.length - mistaken.length} correct · ${mistaken.length} mistaken`}
        />
        {graduations.map((graduation) => (
          <GraduationCelebration
            key={graduation.learned.id}
            graduation={graduation}
            settings={data.settings}
            compact
          />
        ))}
        <View style={styles.results}>
          {mistaken.length ? (
            <>
              <Text style={styles.resultsTitle}>MISTAKEN WORDS</Text>
              {mistaken.map((w) => (
                <View key={w!.id} style={styles.mistake}>
                  <Pressable onPress={() => copyText(w!.hanzi)}>
                    <Text style={styles.mistakeHanzi}>{w!.hanzi}</Text>
                  </Pressable>
                  <SpeakerButton text={w!.hanzi} settings={data.settings} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mistakePinyin}>{w!.pinyin}</Text>
                    <Text style={styles.mistakeRussian}>{w!.russian}</Text>
                    <WordGuessStats word={w!} />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.success}>✓</Text>
              <Text style={styles.roundText}>
                No mistaken words this round.
              </Text>
            </>
          )}
        </View>
        <Button
          label="Start next SRS round"
          icon="play"
          onPress={startNextRound}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header
        eyebrow={`Round ${studyRound} · Card ${position + 1} of ${roundWords.length}`}
        title="Flashcards"
        subtitle={`${word.cardSrsLevel < CARD_GRADUATION_LEVEL ? `Learning step ${word.cardSrsLevel + 1} of ${CARD_GRADUATION_LEVEL}` : `Retention level ${word.cardSrsLevel}`} · ${mistakeIds.length} mistaken`}
      />
      <View style={styles.progress}>
        <View
          style={[
            styles.fill,
            { width: `${((position + 1) / roundWords.length) * 100}%` },
          ]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={flipped ? "Hide answer" : "Reveal answer"}
        style={[styles.card, flipped && styles.back]}
        onPress={() => {
          setFlipped((value) => {
            const next = !value;
            setRevealed(next);
            return next;
          });
        }}
      >
        {!flipped ? (
          <>
            <Text style={styles.side}>RUSSIAN</Text>
            <Text style={styles.question}>{word.russian}</Text>
            <WordGuessStats word={word} />
            <Text style={styles.hint}>Tap to reveal</Text>
          </>
        ) : (
          <>
            <View style={styles.hanziRow}>
              <Pressable onPress={() => copyText(word.hanzi)}>
                <Text style={styles.hanzi}>{word.hanzi}</Text>
              </Pressable>
              <HskBadge hanzi={word.hanzi} />
              <SpeakerButton
                text={word.hanzi}
                settings={data.settings}
                size={22}
              />
            </View>
            <Text style={styles.pinyin}>{word.pinyin}</Text>
            <View style={styles.rule} />
            <Text style={styles.side}>EXAMPLES</Text>
            {examples.length ? (
              <View style={styles.examples}>
                {examples.map((s) => (
                  <ExampleRow
                    key={s!.id}
                    sentence={s!}
                    settings={data.settings}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.waiting}>
                {generating ? "Generating examples…" : "No examples yet"}
              </Text>
            )}
          </>
        )}
      </Pressable>
      <View style={styles.controls}>
        {revealed ? (
          <>
            <Button
              secondary
              label="I don't know"
              icon="close"
              onPress={() => grade(false)}
            />
            <Button
              label="I know"
              icon="checkmark"
              onPress={() => grade(true)}
            />
          </>
        ) : (
          <Button
            label="Reveal answer"
            icon="eye-outline"
            onPress={() => {
              setRevealed(true);
              setFlipped(true);
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

function GraduationCelebration({
  graduation,
  settings,
  compact = false,
}: {
  graduation: Graduation;
  settings: Settings;
  compact?: boolean;
}) {
  return (
    <View style={[styles.celebration, compact && styles.celebrationCompact]}>
      <Text style={styles.confetti}>🎉</Text>
      <Text style={styles.celebrationTitle}>LEARNED</Text>
      <View style={styles.graduationWordRow}>
        <Text style={styles.learnedHanzi}>{graduation.learned.hanzi}</Text>
        <SpeakerButton
          text={graduation.learned.hanzi}
          settings={settings}
          size={24}
        />
      </View>
      <Text style={styles.learnedPinyin}>{graduation.learned.pinyin}</Text>
      <Text style={styles.learnedRussian}>{graduation.learned.russian}</Text>
      <WordGuessStats word={graduation.learned} />
      {graduation.replacement ? (
        <View
          style={[
            styles.replacement,
            compact && styles.replacementCompact,
          ]}
        >
          <Text style={styles.replacementLabel}>NEW IN THE ACTIVE POOL</Text>
          <Text style={styles.confetti}>👀</Text>
          <Text style={styles.learnTitle}>LEARN</Text>
          <View style={styles.graduationWordRow}>
            <Text style={styles.learnedHanzi}>
              {graduation.replacement.hanzi}
            </Text>
            <SpeakerButton
              text={graduation.replacement.hanzi}
              settings={settings}
              size={24}
            />
          </View>
          <Text style={styles.learnedPinyin}>{graduation.replacement.pinyin}</Text>
          <Text style={styles.learnedRussian}>
            {graduation.replacement.russian}
          </Text>
          <WordGuessStats word={graduation.replacement} />
        </View>
      ) : (
        <Text style={styles.deckComplete}>No queued word is waiting to replace it.</Text>
      )}
    </View>
  );
}

function WordGuessStats({ word }: { word: Word }) {
  return (
    <Text style={styles.guessStats}>
      ✓ {word.cardSrsCorrect} · ✗ {word.cardSrsIncorrect}
    </Text>
  );
}

function ExampleRow({
  sentence,
  settings,
}: {
  sentence: Sentence;
  settings: Settings;
}) {
  const translationCoverOpacity = useRef(new Animated.Value(1)).current;
  const revealed = useRef(false);
  const setTranslationVisible = (visible: boolean) => {
    revealed.current = visible;
    translationCoverOpacity.setValue(visible ? 0 : 1);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sentence.chinese.replaceAll(" ", "")}. Copy sentence`}
      onHoverIn={() => setTranslationVisible(true)}
      onHoverOut={() => setTranslationVisible(false)}
      onPress={() => {
        setTranslationVisible(!revealed.current);
        copyText(sentence.chinese.replaceAll(" ", ""));
      }}
      style={styles.exampleRow}
    >
      <View style={styles.exampleChinese}>
        <Text style={styles.example}>
          {sentence.chinese.replaceAll(" ", "")}
        </Text>
        <SpeakerButton text={sentence.chinese} settings={settings} />
      </View>
      <View style={styles.exampleHelp}>
        <View style={styles.exampleCoveredLine}>
          <Text style={styles.examplePinyin}>{sentence.pinyin}</Text>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.exampleTranslationCover,
              { opacity: translationCoverOpacity },
            ]}
          />
        </View>
        <View style={[styles.exampleCoveredLine, styles.exampleRussianLine]}>
          <Text style={styles.exampleRussian}>{sentence.russian}</Text>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.exampleTranslationCover,
              { opacity: translationCoverOpacity },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  celebration: {
    marginBottom: 16,
    borderRadius: 22,
    backgroundColor: "#FFF4D6",
    borderWidth: 1,
    borderColor: "#E8C76A",
    padding: 26,
    alignItems: "center",
    overflow: "hidden",
  },
  celebrationCompact: { padding: 20 },
  confetti: { fontSize: 42, marginBottom: 8 },
  celebrationTitle: {
    color: colors.coral,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  graduationWordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  learnedHanzi: { color: colors.ink, fontSize: 54, fontWeight: "800", marginTop: 8 },
  learnedPinyin: { color: colors.green, fontSize: 18, fontWeight: "700" },
  learnedRussian: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  replacement: {
    alignSelf: "stretch",
    marginTop: 22,
    marginHorizontal: -26,
    marginBottom: -26,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 21,
    borderBottomRightRadius: 21,
    backgroundColor: "#EAF6FF",
    borderTopWidth: 1,
    borderColor: "#B9DDF5",
    alignItems: "center",
  },
  replacementCompact: { marginHorizontal: -20, marginBottom: -20 },
  replacementLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  learnTitle: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  deckComplete: { color: colors.muted, textAlign: "center", marginTop: 20 },
  guessStats: { color: colors.muted, fontSize: 9, marginTop: 4 },
  hanziRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  exampleChinese: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  roundPanel: {
    minHeight: 280,
    marginBottom: 16,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  roundIcon: { fontSize: 54, color: colors.green },
  roundTitle: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 12,
  },
  roundText: {
    color: colors.muted,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  results: {
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },
  resultsTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  mistake: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  mistakeHanzi: {
    width: 70,
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
  },
  mistakePinyin: { color: colors.green, fontSize: 16, fontWeight: "700" },
  mistakeRussian: { color: colors.muted, marginTop: 4 },
  success: {
    color: colors.green,
    fontSize: 50,
    fontWeight: "800",
    textAlign: "center",
  },
  progress: {
    height: 5,
    backgroundColor: colors.line,
    borderRadius: 4,
    marginBottom: 20,
    overflow: "hidden",
  },
  fill: { height: 5, backgroundColor: colors.coral },
  card: {
    minHeight: 410,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#36392F",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  back: { justifyContent: "flex-start", paddingTop: 50 },
  side: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  question: {
    fontSize: 31,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    marginTop: 20,
  },
  hint: { position: "absolute", bottom: 24, color: colors.muted, fontSize: 13 },
  hanzi: { fontSize: 66, fontWeight: "700", color: colors.ink },
  pinyin: { fontSize: 20, color: colors.green, marginTop: 6 },
  rule: {
    height: 1,
    width: "100%",
    backgroundColor: colors.line,
    marginVertical: 27,
  },
  examples: { width: "100%", marginTop: 8 },
  exampleRow: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingVertical: 8,
  },
  example: { flex: 1, fontSize: 21, color: colors.ink, textAlign: "right" },
  exampleHelp: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingLeft: 18,
  },
  exampleCoveredLine: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    position: "relative",
  },
  exampleTranslationCover: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
    backgroundColor: colors.line,
  },
  examplePinyin: { color: colors.green, fontSize: 14, fontWeight: "700" },
  exampleRussianLine: { marginTop: 3 },
  exampleRussian: { color: colors.muted, fontSize: 13 },
  waiting: { color: colors.muted, marginTop: 20 },
  controls: { flexDirection: "row", gap: 10, marginTop: 16 },
});
