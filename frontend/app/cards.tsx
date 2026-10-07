import { displayTranslation, LANGUAGES, maskTranslatedHanzi, Text, useTranslation } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useStore } from "@/context";
import { colors } from "@/theme";
import { Button, FittedTranslation, Header, HskBadge, shell, SpeakerButton } from "@/ui";
import { Sentence, Settings, Word } from "@/types";
import { copyText } from "@/clipboard";
import {
  ACTIVE_CARD_LIMIT,
  CARD_GRADUATION_LEVEL,
  CARD_ROUND_SIZE,
  selectRound,
} from "@/card-srs";
import { finishExercise } from "@/exercise-progress";
import { resolveSentencePronunciation, resolveWordPronunciation } from "@/pronunciation";
import { recordRoundCompletion, undoRoundCompletion } from "@/round-history";
import { track } from "@/telemetry";
import { ExplanationButton } from "@/explanation-button";
import { captureCardReviewUndo, restoreCardReview, type CardReviewUndo } from "@/card-review-undo";

type Phase = "ready" | "studying" | "celebrating" | "complete";
type Graduation = { learned: Word; replacement?: Word };
type ReviewedCard = { position: number; correct: boolean; graduated: boolean; completedAt?: number; undo: CardReviewUndo };
const webDragSurface = Platform.OS === "web"
  ? ({ touchAction: "none" } as any)
  : undefined;
const CARD_STACK_STEP = 12;
const waveOffset = (depth: number) => ({
  x: Math.round(Math.sin(depth * 1.65) * depth * CARD_STACK_STEP),
  y: depth * 10,
});
const webStackOffsetTransition = Platform.OS === "web"
  ? ({
      transitionProperty: "left, right, top, transform",
      transitionDuration: "460ms",
      transitionTimingFunction: "cubic-bezier(0.75, -0.06, 0, 1)",
    } as any)
  : undefined;

export default function Cards() {
  const { data, patch, generateBatch } = useStore();
  const t = useTranslation();
  const [studyRound, setStudyRound] = useState(data.cardRound + 1),
    [roundIds, setRoundIds] = useState<string[]>([]),
    [position, setPosition] = useState(0),
    [phase, setPhase] = useState<Phase>("ready"),
    [flipped, setFlipped] = useState(false),
    [exampleIndex, setExampleIndex] = useState(0),
    [mistakeIds, setMistakeIds] = useState<string[]>([]),
    [graduations, setGraduations] = useState<Graduation[]>([]),
    [reviewedCards, setReviewedCards] = useState<ReviewedCard[]>([]),
    [roundEndsAfterCelebration, setRoundEndsAfterCelebration] = useState(false),
    [cardHeights, setCardHeights] = useState<Record<string, number>>({}),
    [roundTilts, setRoundTilts] = useState<Record<string, number>>({});
  const swipe = useRef(new Animated.ValueXY()).current;
  const cardSpin = useRef(new Animated.Value(0)).current;
  const grading = useRef(false);
  const total = data.words.length;
  const translationLanguage = LANGUAGES.find(item => item.code === data.settings.language)?.nativeLabel.toUpperCase() ?? "ENGLISH";
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
    void track("round_started", { round, size: words.length, mode: "cards" });
    setStudyRound(round);
    patch((d) => ({ ...d, cardRound: Math.max(d.cardRound, round) }));
    setRoundIds(words.map((w) => w.id));
    setRoundTilts(Object.fromEntries(words.map((item, index) => [
      item.id, index === 0 ? 0 : Math.random() * 60 - 30,
    ])));
    setCardHeights({});
    setPosition(0);
    setMistakeIds([]);
    setGraduations([]);
    setReviewedCards([]);
    setRoundEndsAfterCelebration(false);
    setFlipped(false);
    setExampleIndex(0);
    grading.current = false;
    swipe.setValue({ x: 0, y: 0 });
    cardSpin.setValue(0);
    setPhase("studying");
  };
  const startRound = () => begin(upcoming, data.cardRound + 1);
  const startNextRound = startRound;
  const grade = (correct: boolean) => {
    if (!word) return;
    const reviewedAt = Date.now();
    const roundComplete = position + 1 === roundWords.length;
    const updatedWords = finishExercise(
      data,
      { kind: "card", wordId: word.id, correct, round: studyRound },
      reviewedAt,
    ).words;
    const undo = captureCardReviewUndo(data.words, updatedWords);
    patch((d) => {
      const progressed = finishExercise(
        d,
        { kind: "card", wordId: word.id, correct, round: studyRound },
        reviewedAt,
      );
      return roundComplete
        ? recordRoundCompletion(progressed, studyRound, reviewedAt)
        : progressed;
    });
    if (!correct) setMistakeIds((ids) => [...ids, word.id]);
    void track("card_reviewed", { round: studyRound, result: correct ? "correct" : "incorrect", mode: "cards" });
    if (roundComplete) void track("round_completed", { round: studyRound, size: roundWords.length, mode: "cards" });
    const learned = updatedWords.find(
      (item) => item.id === word.id && word.cardActive && !item.cardActive,
    );
    const replacement = updatedWords.find(
      (item) =>
        item.id !== word.id &&
        item.cardActive &&
        !data.words.find((before) => before.id === item.id)?.cardActive,
    );
    setReviewedCards((cards) => [...cards, {
      position,
      correct,
      graduated: !!learned,
      completedAt: roundComplete ? reviewedAt : undefined,
      undo,
    }]);
    if (learned) {
      setGraduations((items) => [...items, { learned, replacement }]);
      setRoundEndsAfterCelebration(roundComplete);
      setPhase("celebrating");
    } else if (roundComplete) setPhase("complete");
    else setPosition((p) => p + 1);
    setFlipped(false);
    setExampleIndex(0);
    swipe.setValue({ x: 0, y: 0 });
    cardSpin.setValue(0);
  };
  const previousCard = () => {
    const previous = reviewedCards.at(-1);
    const previousPosition = phase === "studying" ? position - 1 : position;
    if (!previous || previous.position !== previousPosition) return;
    swipe.stopAnimation();
    cardSpin.stopAnimation();
    grading.current = false;
    patch((current) => ({
      ...current,
      words: restoreCardReview(current.words, previous.undo),
      roundCompletions: previous.completedAt === undefined
        ? current.roundCompletions
        : undoRoundCompletion(current.roundCompletions, studyRound, previous.completedAt),
    }));
    setReviewedCards((cards) => cards.slice(0, -1));
    if (!previous.correct) setMistakeIds((ids) => ids.slice(0, -1));
    if (previous.graduated) setGraduations((items) => items.slice(0, -1));
    setRoundEndsAfterCelebration(false);
    setPosition(previous.position);
    setPhase("studying");
    setFlipped(true);
    setExampleIndex(0);
    swipe.setValue({ x: 0, y: 0 });
    cardSpin.setValue(0);
  };
  const continueAfterCelebration = () => {
    if (roundEndsAfterCelebration) setPhase("complete");
    else {
      setPosition((p) => p + 1);
      setPhase("studying");
    }
    setRoundEndsAfterCelebration(false);
  };
  const finishSwipe = (correct: boolean) => {
    if (grading.current) return;
    grading.current = true;
    Animated.timing(swipe, {
      toValue: { x: correct ? 520 : -520, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      grading.current = false;
      if (finished) grade(correct);
    });
  };
  const flipCard = (nextFlipped: boolean) => {
    if (nextFlipped === flipped) return;
    Animated.timing(cardSpin, {
      toValue: 0.5,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setFlipped(nextFlipped);
      Animated.timing(cardSpin, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished: completed }) => {
        if (completed) cardSpin.setValue(0);
      });
    });
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      flipped
        ? Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) >= Math.abs(gesture.dy)
        : Math.hypot(gesture.dx, gesture.dy) > 8,
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      flipped
        ? Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) >= Math.abs(gesture.dy)
        : Math.hypot(gesture.dx, gesture.dy) > 8,
    onPanResponderGrant: () => swipe.stopAnimation(),
    onPanResponderMove: (_, gesture) => {
      if (flipped) swipe.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_, gesture) => {
      if (!flipped) flipCard(true);
      else if (gesture.dx > 100) finishSwipe(true);
      else if (gesture.dx < -100) finishSwipe(false);
      else if (Math.abs(gesture.dy) > 100) {
        swipe.setValue({ x: 0, y: 0 });
        flipCard(false);
      }
      else
        Animated.spring(swipe, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          speed: 22,
          bounciness: 7,
        }).start();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      Animated.spring(swipe, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
      }).start();
    },
  });

  if (phase === "ready")
    return (
      <ScrollView style={shell.page} contentContainerStyle={shell.content}>
        <Header
          eyebrow={`${t("Round")} ${data.cardRound + 1}`}
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
        <RoundReviewHeader
          eyebrow={`${t("Round")} ${studyRound} · ${t("Milestone")}`}
          title="Word learned!"
          subtitle="A word graduated from your active card pool."
          onPreviousCard={previousCard}
        />
        <SwipeableGraduation
          graduation={graduation}
          settings={data.settings}
          onContinue={continueAfterCelebration}
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
        <RoundReviewHeader
          eyebrow={`${t("Round")} ${studyRound} ${t("complete")}`}
          title={
            mistaken.length ? `${mistaken.length} ${t("to review")}` : "Perfect round!"
          }
          subtitle={`${roundWords.length - mistaken.length} ${t("correct")} · ${mistaken.length} ${t("mistaken")}`}
          onPreviousCard={previousCard}
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
              {mistaken.map((w) => {
                const pronunciation = resolveWordPronunciation(w!, displayTranslation(w!.russian, data.settings.language));
                return <View key={w!.id} style={styles.mistake}>
                  <ExplanationButton kind="word" text={pronunciation.hanzi} size={19} />
                  <Pressable onPress={() => copyText(pronunciation.hanzi)}>
                    <Text style={styles.mistakeHanzi}>{pronunciation.hanzi}</Text>
                  </Pressable>
                  <SpeakerButton pronunciation={pronunciation} settings={data.settings} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mistakePinyin}>{pronunciation.pinyin}</Text>
                    <Text style={styles.mistakeRussian}>{pronunciation.meaning}</Text>
                    <WordGuessStats word={w!} />
                  </View>
                </View>;
              })}
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
      <RoundReviewHeader
        eyebrow={`${t("Round")} ${studyRound} · ${t("Card")} ${position + 1} ${t("of")} ${roundWords.length}`}
        title="Flashcards"
        subtitle={`${word.cardSrsLevel < CARD_GRADUATION_LEVEL ? `${t("Learning step")} ${word.cardSrsLevel + 1} ${t("of")} ${CARD_GRADUATION_LEVEL}` : `${t("Retention level")} ${word.cardSrsLevel}`} · ${mistakeIds.length} ${t("mistaken")}`}
        onPreviousCard={position > 0 ? previousCard : undefined}
      />
      <View style={styles.progress}>
        <View
          style={[
            styles.fill,
            { width: `${((position + 1) / roundWords.length) * 100}%` },
          ]}
        />
      </View>
      <View style={[styles.studyStack, {
        height: (cardHeights[word.id] ?? 300) + (roundWords.length - 1) * CARD_STACK_STEP,
      }]}>
        {roundWords.slice(position).map((stackWord, index) => (
          <StackCard
            key={stackWord.id}
            word={stackWord}
            depth={index}
            roundIndex={position + index}
            initialTilt={roundTilts[stackWord.id] ?? 0}
            active={index === 0}
            height={cardHeights[stackWord.id] ?? 300}
            settings={data.settings}
            translationLanguage={translationLanguage}
            examples={(data.wordSentenceIndex[stackWord.id] ?? [])
              .map((id) => data.sentences.find((sentence) => sentence.id === id))
              .filter(Boolean).slice(0, 3) as Sentence[]}
            flipped={flipped}
            exampleIndex={exampleIndex}
            onExampleIndexChange={setExampleIndex}
            swipe={swipe}
            cardSpin={cardSpin}
            panHandlers={panResponder.panHandlers}
            onFlip={flipCard}
            onGrade={finishSwipe}
            onHeightChange={(height) => setCardHeights((current) =>
              current[stackWord.id] === height ? current : { ...current, [stackWord.id]: height })}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function RoundReviewHeader({ eyebrow, title, subtitle, onPreviousCard }: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onPreviousCard?: () => void;
}) {
  return <View style={styles.studyHeading}>
    <View style={styles.studyTitle}>
      <Header eyebrow={eyebrow} title={title} subtitle={subtitle} />
    </View>
    {onPreviousCard && <Pressable
      accessibilityRole="button"
      accessibilityLabel="Previous card"
      onPress={onPreviousCard}
      style={({ pressed }) => [styles.previousCardButton, pressed && styles.previousCardButtonPressed]}
    >
      <Ionicons name="arrow-back" size={22} color={colors.green} />
    </Pressable>}
  </View>;
}

function StackCard({ word, depth, roundIndex, initialTilt, active, height, settings, translationLanguage,
  examples, flipped, exampleIndex, onExampleIndexChange, swipe, cardSpin,
  panHandlers, onFlip, onGrade, onHeightChange,
}: {
  word: Word;
  depth: number;
  roundIndex: number;
  initialTilt: number;
  active: boolean;
  height: number;
  settings: Settings;
  translationLanguage: string;
  examples: Sentence[];
  flipped: boolean;
  exampleIndex: number;
  onExampleIndexChange: (index: number) => void;
  swipe: Animated.ValueXY;
  cardSpin: Animated.Value;
  panHandlers: ReturnType<typeof PanResponder.create>["panHandlers"];
  onFlip: (flipped: boolean) => void;
  onGrade: (correct: boolean) => void;
  onHeightChange: (height: number) => void;
}) {
  const t = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const pronunciation = resolveWordPronunciation(word, displayTranslation(word.russian, settings.language));
  const hanziWidth = Math.min(200, Math.max(120, screenWidth - 100));
  const hanziSize = Math.min(66, Math.floor(hanziWidth / Math.max(1, Array.from(pronunciation.hanzi).length)));
  const [frontHeight, setFrontHeight] = useState(0);
  const [backHeight, setBackHeight] = useState(0);
  useEffect(() => {
    onHeightChange(Math.max(300, Math.ceil(frontHeight + 84), Math.ceil(backHeight + 52)));
  }, [frontHeight, backHeight]);
  const showingBack = active && flipped;
  const offset = waveOffset(depth);
  const tilt = roundIndex === 0 ? 0 : initialTilt * depth / roundIndex;
  return (
    <View
      accessible={active}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      pointerEvents={active ? "auto" : "none"}
      style={[styles.stackCard, {
        top: offset.y,
        left: offset.x,
        right: -offset.x,
        zIndex: 10 - depth,
        transformOrigin: initialTilt >= 0 ? "left top" : "right top",
        transform: [{ rotate: `${tilt}deg` }],
      }, webStackOffsetTransition, Platform.OS === "web" && ({ transitionDelay: `${depth * 25}ms` } as any)]}
    >
      <Animated.View
        {...(active ? panHandlers : {})}
        style={[active && webDragSurface, active && {
          transform: [
            { translateX: flipped ? swipe.x : 0 },
            { translateY: flipped ? swipe.y : 0 },
            { rotateY: cardSpin.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ["0deg", "90deg", "0deg"],
            }) },
          ],
        }]}
      >
        <Pressable
          disabled={!active}
          accessibilityRole={active ? "button" : undefined}
          accessibilityLabel={active ? showingBack ? "Hide answer" : "Reveal answer" : undefined}
          accessibilityActions={showingBack ? [
            { name: "decrement", label: "Mark wrong" },
            { name: "increment", label: "Mark correct" },
          ] : undefined}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "decrement") onGrade(false);
            if (event.nativeEvent.actionName === "increment") onGrade(true);
          }}
          onPress={() => onFlip(!flipped)}
          style={[styles.card, { height }]}
        >
          {active && <Animated.View pointerEvents="none" style={[
            styles.correctSwipeTint,
            { opacity: swipe.x.interpolate({
              inputRange: [0, 60, 110, 170, 240],
              outputRange: [0, 0.04, 0.16, 0.48, 1],
              extrapolate: "clamp",
            }) },
          ]} />}
          <View
            pointerEvents={showingBack ? "none" : "auto"}
            accessibilityElementsHidden={showingBack}
            importantForAccessibility={showingBack ? "no-hide-descendants" : "auto"}
            style={[styles.frontFace, { opacity: showingBack ? 0 : 1 }]}
          >
            <View onLayout={(event) => setFrontHeight(event.nativeEvent.layout.height)} style={styles.cardContent}>
              <Text style={styles.side}>{translationLanguage}</Text>
              <FittedTranslation text={maskTranslatedHanzi(pronunciation.meaning, pronunciation.hanzi)} />
              <WordGuessStats word={word} />
            </View>
          </View>
          <View
            pointerEvents={showingBack ? "auto" : "none"}
            accessibilityElementsHidden={!showingBack}
            importantForAccessibility={showingBack ? "auto" : "no-hide-descendants"}
            style={[styles.backFace, { opacity: showingBack ? 1 : 0 }]}
          >
            <View onLayout={(event) => setBackHeight(event.nativeEvent.layout.height)} style={styles.cardContent}>
              <Animated.Text pointerEvents="none" style={[styles.swipeBadge, styles.wrongBadge, {
                opacity: swipe.x.interpolate({ inputRange: [-100, -35], outputRange: [1, 0], extrapolate: "clamp" }),
              }]}>{t("WRONG")}</Animated.Text>
              <Animated.Text pointerEvents="none" style={[styles.swipeBadge, styles.rightBadge, {
                opacity: swipe.x.interpolate({ inputRange: [35, 100], outputRange: [0, 1], extrapolate: "clamp" }),
              }]}>{t("RIGHT")}</Animated.Text>
              <View style={styles.cardControls}>
                <ExplanationButton kind="word" text={pronunciation.hanzi} />
                <HskBadge hanzi={pronunciation.hanzi} />
                <SpeakerButton pronunciation={pronunciation} settings={settings} size={22} />
              </View>
              <Pressable style={styles.hanziPressable} onPress={(event) => {
                event.stopPropagation();
                copyText(pronunciation.hanzi);
              }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.hanzi, { fontSize: hanziSize }]}>
                  {pronunciation.hanzi}
                </Text>
              </Pressable>
              <Text style={styles.pinyin}>{pronunciation.pinyin}</Text>
              <View style={styles.rule} />
              {examples.length ? <ExampleCarousel examples={examples} settings={settings}
                index={active ? exampleIndex : 0} onIndexChange={onExampleIndexChange} /> : null}
              <Text style={styles.swipeHint}>← Wrong · Right →</Text>
            </View>
          </View>
          {!showingBack && <Text style={styles.hint}>Tap to reveal</Text>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function SwipeableGraduation({
  graduation,
  settings,
  onContinue,
}: {
  graduation: Graduation;
  settings: Settings;
  onContinue: () => void;
}) {
  const t = useTranslation();
  const swipe = useRef(new Animated.ValueXY()).current;
  const swipeHint = useRef(new Animated.Value(0)).current;
  const learnedEntry = useRef(new Animated.Value(0)).current;
  const replacementEntry = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const continuing = useRef(false);
  const [showingReplacement, setShowingReplacement] = useState(false);
  useEffect(() => {
    learnedEntry.setValue(0);
    replacementEntry.setValue(0);
    const entrance = Animated.parallel([
      Animated.timing(learnedEntry, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(replacementEntry, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [graduation.learned.id]);
  useEffect(() => {
    if (!graduation.replacement || showingReplacement) return;
    const animation = Animated.sequence([
      Animated.delay(450),
      Animated.timing(swipeHint, {
        toValue: -20,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(swipeHint, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.delay(650),
      Animated.timing(swipeHint, {
        toValue: 20,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(swipeHint, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
      swipeHint.setValue(0);
    };
  }, [graduation.replacement?.id, showingReplacement]);
  const continueInDirection = (direction: number) => {
    if (continuing.current) return;
    continuing.current = true;
    Animated.timing(swipe, {
      toValue: { x: direction * 520, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onContinue();
      else continuing.current = false;
    });
  };
  const revealReplacement = (direction: number) => {
    if (continuing.current) return;
    continuing.current = true;
    swipeHint.stopAnimation();
    Animated.timing(swipe, {
      toValue: { x: direction * 520, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        continuing.current = false;
        return;
      }
      swipe.setValue({ x: 0, y: 0 });
      setShowingReplacement(true);
      continuing.current = false;
    });
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.hypot(gesture.dx, gesture.dy) > 8,
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      Math.hypot(gesture.dx, gesture.dy) > 8,
    onPanResponderGrant: () => {
      swipeHint.stopAnimation();
      swipeHint.setValue(0);
      swipe.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      swipe.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_, gesture) => {
      if (
        graduation.replacement &&
        !showingReplacement &&
        Math.abs(gesture.dx) > 100
      ) {
        revealReplacement(gesture.dx < 0 ? -1 : 1);
      } else if (
        (!graduation.replacement || showingReplacement) &&
        Math.abs(gesture.dx) > 100
      ) {
        continueInDirection(gesture.dx < 0 ? -1 : 1);
      } else {
        Animated.spring(swipe, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          speed: 22,
          bounciness: 7,
        }).start();
      }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {
      Animated.spring(swipe, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
      }).start();
    },
  });
  const tintOpacity = swipe.x.interpolate({
    inputRange: [-240, -170, -110, -60, 0, 60, 110, 170, 240],
    outputRange: [1, 0.48, 0.16, 0.04, 0, 0.04, 0.16, 0.48, 1],
    extrapolate: "clamp",
  });
  const learnedEntranceX = learnedEntry.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenWidth - 80, 0],
  });
  const replacementEntranceX = replacementEntry.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth + 80, 0],
  });
  return (
    <>
      <View style={styles.graduationStack}>
        {graduation.replacement && !showingReplacement ? (
          <Animated.View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
              styles.graduationUnderlay,
              { transform: [{ translateX: replacementEntranceX }] },
            ]}
          >
            <ActivePoolCard
              word={graduation.replacement}
              settings={settings}
            />
          </Animated.View>
        ) : null}
        <Animated.View
          {...panResponder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={showingReplacement
            ? "New word in the active pool. Swipe any direction to continue"
            : graduation.replacement
              ? "Word learned. Swipe either direction to see the new active pool word"
              : "Word learned. Swipe any direction to continue"}
          accessibilityActions={[{
            name: "activate",
            label: graduation.replacement && !showingReplacement
              ? "Show new active pool word"
              : "Continue",
          }]}
          onAccessibilityAction={() => {
            if (graduation.replacement && !showingReplacement) revealReplacement(1);
            else continueInDirection(1);
          }}
          style={[
            webDragSurface,
            styles.graduationTopCard,
            {
              transform: [
                {
                  translateX: Animated.add(
                    Animated.add(swipe.x, swipeHint),
                    learnedEntranceX,
                  ),
                },
                { translateY: swipe.y },
                {
                  rotate: swipe.x.interpolate({
                    inputRange: [-240, 0, 240],
                    outputRange: ["-8deg", "0deg", "8deg"],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        >
          {showingReplacement && graduation.replacement ? (
            <ActivePoolCard
              word={graduation.replacement}
              settings={settings}
              swipeTintOpacity={tintOpacity}
            />
          ) : (
            <GraduationCelebration
              graduation={graduation}
              settings={settings}
              showPoolUpdate={!graduation.replacement}
              standalone
              swipeTintOpacity={graduation.replacement ? undefined : tintOpacity}
            />
          )}
        </Animated.View>
      </View>
      <Text style={styles.graduationSwipeHint}>
        {graduation.replacement && !showingReplacement
          ? `← ${t("Swipe either direction to meet the new active word")} →`
          : `← ${t("Swipe any direction to continue")} →`}
      </Text>
    </>
  );
}

function GraduationCelebration({
  graduation,
  settings,
  compact = false,
  showPoolUpdate = true,
  standalone = false,
  swipeTintOpacity,
}: {
  graduation: Graduation;
  settings: Settings;
  compact?: boolean;
  showPoolUpdate?: boolean;
  standalone?: boolean;
  swipeTintOpacity?: Animated.AnimatedInterpolation<number>;
}) {
  const learned = resolveWordPronunciation(
    graduation.learned,
    displayTranslation(graduation.learned.russian, settings.language),
  );
  const replacement = graduation.replacement
    ? resolveWordPronunciation(
        graduation.replacement,
        displayTranslation(graduation.replacement.russian, settings.language),
      )
    : undefined;
  return (
    <View style={[
      styles.celebration,
      compact && styles.celebrationCompact,
      standalone && styles.celebrationStandalone,
    ]}>
      {swipeTintOpacity ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.correctSwipeTint, { opacity: swipeTintOpacity }]}
        />
      ) : null}
      <Text style={styles.confetti}>🎉</Text>
      <Text style={styles.celebrationTitle}>LEARNED</Text>
      <View style={styles.graduationWordRow}>
        <ExplanationButton kind="word" text={learned.hanzi} />
        <Text style={styles.learnedHanzi}>{learned.hanzi}</Text>
        <SpeakerButton
          pronunciation={learned}
          settings={settings}
          size={24}
        />
      </View>
      <Text style={styles.learnedPinyin}>{learned.pinyin}</Text>
      <Text style={styles.learnedRussian}>{learned.meaning}</Text>
      <WordGuessStats word={graduation.learned} />
      {showPoolUpdate && graduation.replacement && replacement ? (
        <View
          style={[
            styles.replacement,
            compact && styles.replacementCompact,
          ]}
        >
          {swipeTintOpacity ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.correctSwipeTint, { opacity: swipeTintOpacity }]}
            />
          ) : null}
          <Text style={styles.replacementLabel}>NEW IN THE ACTIVE POOL</Text>
          <Text style={styles.confetti}>👀</Text>
          <Text style={styles.learnTitle}>LEARN</Text>
          <View style={styles.graduationWordRow}>
            <ExplanationButton kind="word" text={replacement.hanzi} />
            <Text style={styles.learnedHanzi}>
              {replacement.hanzi}
            </Text>
            <SpeakerButton
              pronunciation={replacement}
              settings={settings}
              size={24}
            />
          </View>
          <Text style={styles.learnedPinyin}>{replacement.pinyin}</Text>
          <Text style={styles.learnedRussian}>
            {replacement.meaning}
          </Text>
          <WordGuessStats word={graduation.replacement} />
        </View>
      ) : showPoolUpdate ? (
        <Text style={styles.deckComplete}>No queued word is waiting to replace it.</Text>
      ) : null}
    </View>
  );
}

function ActivePoolCard({
  word,
  settings,
  swipeTintOpacity,
}: {
  word: Word;
  settings: Settings;
  swipeTintOpacity?: Animated.AnimatedInterpolation<number>;
}) {
  const pronunciation = resolveWordPronunciation(
    word,
    displayTranslation(word.russian, settings.language),
  );
  return (
    <View
      style={[
        styles.celebration,
        styles.celebrationStandalone,
        styles.activePoolCard,
      ]}
    >
      {swipeTintOpacity ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.correctSwipeTint, { opacity: swipeTintOpacity }]}
        />
      ) : null}
      <Text style={styles.replacementLabel}>NEW IN THE ACTIVE POOL</Text>
      <Text style={styles.confetti}>👀</Text>
      <Text style={styles.learnTitle}>LEARN</Text>
      <View style={styles.graduationWordRow}>
        <ExplanationButton kind="word" text={pronunciation.hanzi} />
        <Text style={styles.learnedHanzi}>{pronunciation.hanzi}</Text>
        <SpeakerButton
          pronunciation={pronunciation}
          settings={settings}
          size={24}
        />
      </View>
      <Text style={styles.learnedPinyin}>{pronunciation.pinyin}</Text>
      <Text style={styles.learnedRussian}>{pronunciation.meaning}</Text>
      <WordGuessStats word={word} />
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
  const pronunciation = resolveSentencePronunciation(sentence);
  const translationCoverOpacity = useRef(new Animated.Value(1)).current;
  const revealed = useRef(false);
  const setTranslationVisible = (visible: boolean) => {
    revealed.current = visible;
    translationCoverOpacity.setValue(visible ? 0 : 1);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pronunciation.hanzi}. Copy sentence`}
      onHoverIn={() => setTranslationVisible(true)}
      onHoverOut={() => setTranslationVisible(false)}
      onPress={() => {
        setTranslationVisible(!revealed.current);
        copyText(pronunciation.hanzi);
      }}
      style={styles.exampleRow}
    >
      <View style={styles.exampleChinese}>
        <Text style={styles.example}>
          {pronunciation.hanzi}
        </Text>
        <View style={styles.exampleSentenceControls}>
          <SpeakerButton pronunciation={pronunciation} settings={settings} />
          <ExplanationButton kind="sentence" text={sentence.chinese} size={18} />
        </View>
      </View>
      <View style={styles.exampleHelp}>
        <View style={styles.exampleCoveredLine}>
          <Text style={styles.examplePinyin}>{pronunciation.pinyin}</Text>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.exampleTranslationCover,
              { opacity: translationCoverOpacity },
            ]}
          />
        </View>
        <View style={[styles.exampleCoveredLine, styles.exampleRussianLine]}>
          <Text style={styles.exampleRussian}>{pronunciation.meaning}</Text>
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

function ExampleCarousel({
  examples,
  settings,
  index,
  onIndexChange,
}: {
  examples: Sentence[];
  settings: Settings;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const animation = useRef(new Animated.Value(0)).current;
  const [transition, setTransition] = useState<{ next: number; direction: -1 | 1 } | null>(null);
  const move = (direction: -1 | 1) => {
    if (transition || examples.length < 2) return;
    const next = (index + direction + examples.length) % examples.length;
    setTransition({ next, direction });
    animation.setValue(0);
    Animated.timing(animation, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onIndexChange(next);
      setTransition(null);
      animation.setValue(0);
    });
  };
  const current = examples[index];
  const incoming = transition ? examples[transition.next] : null;
  const offset = transition?.direction === -1 ? -1 : 1;
  return (
    <View style={styles.exampleCarousel}>
      <View style={styles.exampleViewport}>
        <Animated.View
          style={[
            styles.exampleSlide,
            transition && {
              transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [0, offset * 110] }) }],
            },
          ]}
        >
          <ExampleRow sentence={current} settings={settings} />
        </Animated.View>
        {incoming ? (
          <Animated.View
            style={[
              styles.exampleSlide,
              styles.exampleIncoming,
              {
                transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [-offset * 110, 0] }) }],
              },
            ]}
          >
            <ExampleRow sentence={incoming} settings={settings} />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.exampleControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous example"
          disabled={examples.length < 2 || !!transition}
          onPress={(event) => { event.stopPropagation(); move(-1); }}
          style={styles.exampleButton}
        >
          <Text style={styles.exampleButtonText}>↑</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next example"
          disabled={examples.length < 2 || !!transition}
          onPress={(event) => { event.stopPropagation(); move(1); }}
          style={styles.exampleButton}
        >
          <Text style={styles.exampleButtonText}>↓</Text>
        </Pressable>
      </View>
    </View>
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
  celebrationStandalone: { minHeight: 360, justifyContent: "center" },
  activePoolCard: {
    backgroundColor: "#EAF6FF",
    borderColor: "#B9DDF5",
  },
  graduationStack: { position: "relative" },
  graduationUnderlay: {
    ...StyleSheet.absoluteFillObject,
  },
  graduationTopCard: { zIndex: 1 },
  graduationSwipeHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
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
  exampleChinese: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  exampleSentenceControls: { alignItems: 'center', gap: 5 },
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
    marginBottom: 24,
    overflow: "hidden",
  },
  studyHeading: { flexDirection: "row", alignItems: "flex-start" },
  studyTitle: { flex: 1 },
  previousCardButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginTop: 24,
    marginLeft: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  previousCardButtonPressed: { opacity: 0.55 },
  fill: { height: 5, backgroundColor: colors.coral },
  studyStack: { position: "relative" },
  stackCard: {
    position: "absolute",
  },
  card: {
    position: "relative",
    minHeight: 0,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#36392F",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    backfaceVisibility: "hidden",
  },
  frontFace: {
    position: "absolute",
    top: 28,
    left: 28,
    right: 28,
    bottom: 55,
    justifyContent: "center",
  },
  backFace: { position: "absolute", top: 32, left: 28, right: 28 },
  cardContent: { width: "100%", alignItems: "center" },
  correctSwipeTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.green,
    borderRadius: 24,
  },
  side: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  hint: { position: "absolute", left: 0, right: 0, bottom: 24, textAlign: "center", color: colors.muted, fontSize: 13 },
  swipeHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 14,
  },
  swipeBadge: {
    position: "absolute",
    top: 22,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  wrongBadge: { right: 20, color: colors.red, borderColor: colors.red },
  rightBadge: { left: 20, color: colors.green, borderColor: colors.green },
  cardControls: {
    width: "100%",
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hanziPressable: { width: "100%", alignItems: "center", marginTop: 8 },
  hanzi: { fontSize: 66, fontWeight: "700", color: colors.ink, textAlign: "center" },
  pinyin: { fontSize: 20, color: colors.green, marginTop: 6 },
  rule: {
    height: 1,
    width: "100%",
    backgroundColor: colors.line,
    marginVertical: 27,
  },
  exampleCarousel: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10 },
  exampleViewport: { flex: 1, minHeight: 86, overflow: "hidden", position: "relative" },
  exampleSlide: { width: "100%", minHeight: 86, justifyContent: "center" },
  exampleIncoming: { position: "absolute", left: 0, top: 0 },
  exampleControls: { width: 34, gap: 7 },
  exampleButton: { width: 34, height: 30, borderRadius: 8, backgroundColor: colors.pale, alignItems: "center", justifyContent: "center" },
  exampleButtonText: { color: colors.green, fontSize: 19, lineHeight: 21, fontWeight: "800" },
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
});
