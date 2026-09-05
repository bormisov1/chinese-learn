import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@/context";
import { colors } from "@/theme";
import { Header, shell } from "@/ui";
import { Button } from "@/ui";
import { router } from "expo-router";
import { Settings as SettingsData } from "@/types";
import { validateApiKey } from "@/deepseek";
import { getActivePoolQueue } from "@/card-srs";
import { ImportedWord } from "@/ocr";
import hskLevels from "@/data/hsk-levels.json";
import dictionaryRows from "@/data/hsk-russian.json";
import {
  getTtsProvider,
  speakMandarin,
  subscribeToVoices,
  TtsVoice,
} from "@/tts";

export default function Settings() {
  const { data, importWords, patch, setAutomaticWordAddition } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<SettingsSection, number>>({
    general: 0,
    audio: 0,
    vocabulary: 0,
    cards: 0,
    progress: 0,
  });
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const [keyValidation, setKeyValidation] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >(data.settings.apiKeyValidated ? "valid" : "idle");
  const [sort, setSort] = useState<{
    column: "word" | "sentences" | "cards";
    direction: 1 | -1;
  }>({ column: "cards", direction: -1 });
  const update = <K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K],
  ) => patch((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const updateApiKey = (apiKey: string) => {
    setKeyValidation("idle");
    patch((d) => ({
      ...d,
      settings: {
        ...d.settings,
        apiKey,
        apiKeyValidated: false,
        showSentencesTab: false,
      },
    }));
  };
  useEffect(() => {
    const apiKey = data.settings.apiKey.trim();
    if (!apiKey || data.settings.apiKeyValidated) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setKeyValidation("checking");
      try {
        await validateApiKey(apiKey, controller.signal);
        patch((d) =>
          d.settings.apiKey.trim() === apiKey
            ? {
                ...d,
                settings: { ...d.settings, apiKeyValidated: true },
              }
            : d,
        );
        setKeyValidation("valid");
      } catch (error) {
        if (controller.signal.aborted) return;
        setKeyValidation(
          error instanceof Error && error.message.startsWith("Invalid")
            ? "invalid"
            : "error",
        );
      }
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [data.settings.apiKey, data.settings.apiKeyValidated]);
  const now = Date.now();
  const toggleSort = (column: typeof sort.column) =>
    setSort((current) => ({
      column,
      direction: current.column === column ? (current.direction === 1 ? -1 : 1) : -1,
    }));
  const score = (level: number, correct: number, incorrect: number) =>
    level * 1_000 + correct * 10 - incorrect;
  const rankedWords = [...data.words].sort((a, b) => {
    const comparison =
      sort.column === "word"
        ? a.hanzi.localeCompare(b.hanzi)
        : sort.column === "sentences"
          ? score(a.srsLevel, a.srsCorrect, a.srsIncorrect) -
            score(b.srsLevel, b.srsCorrect, b.srsIncorrect)
          : score(a.cardSrsLevel, a.cardSrsCorrect, a.cardSrsIncorrect) -
            score(b.cardSrsLevel, b.cardSrsCorrect, b.cardSrsIncorrect);
    return comparison * sort.direction || a.hanzi.localeCompare(b.hanzi);
  });
  const sortLabel = (column: typeof sort.column, label: string) =>
    `${label}${sort.column === column ? (sort.direction === 1 ? " ↑" : " ↓") : ""}`;
  const activeWords = data.words
    .filter((word) => word.cardActive)
    .sort((a, b) => (a.cardIntroducedAt ?? 0) - (b.cardIntroducedAt ?? 0));
  const queuedWords = getActivePoolQueue(data.words, data.cardRound);
  const stat = (
    level: number,
    correct: number,
    incorrect: number,
    dueAt: number,
  ) => (
    <View style={styles.srsCell}>
      <Text style={styles.level}>
        L{level}
        {dueAt <= now ? " · due" : ""}
      </Text>
      <Text style={styles.score}>
        ✓{correct} ✗{incorrect}
      </Text>
    </View>
  );

  useEffect(() => {
    const index = SETTINGS_SECTIONS.findIndex(({ key }) => key === activeSection);
    Animated.spring(indicatorPosition, {
      toValue: index * NAV_ITEM_HEIGHT,
      damping: 18,
      stiffness: 180,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [activeSection, indicatorPosition]);
  const recordSection = (section: SettingsSection) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[section] = event.nativeEvent.layout.y;
  };
  const trackSection = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const position = event.nativeEvent.contentOffset.y + 120;
    const visible = SETTINGS_SECTIONS.reduce<SettingsSection>(
      (current, item) =>
        sectionOffsets.current[item.key] <= position ? item.key : current,
      "general",
    );
    setActiveSection((current) => (current === visible ? current : visible));
  };
  const goToSection = (section: SettingsSection) => {
    setActiveSection(section);
    scrollRef.current?.scrollTo({
      y: Math.max(0, sectionOffsets.current[section] - 16),
      animated: true,
    });
  };

  return (
    <View style={shell.page}>
      <View style={styles.sideMenu} accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sectionIndicator,
            { transform: [{ translateY: indicatorPosition }] },
          ]}
        />
        {SETTINGS_SECTIONS.map((item) => {
          const selected = activeSection === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label} settings`}
              accessibilityState={{ selected }}
              onPress={() => goToSection(item.key)}
              style={({ pressed }) => [
                styles.sideMenuItem,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={23}
                color={selected ? colors.green : "#8B8E86"}
              />
              <Text style={[styles.sideMenuLabel, selected && styles.sideMenuLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.settingsScroll}
        contentContainerStyle={[shell.content, styles.settingsContent]}
        keyboardShouldPersistTaps="handled"
        onScroll={trackSection}
        scrollEventThrottle={32}
      >
        <Header
          eyebrow="Configuration"
          title="Settings"
          subtitle="Your key and study data stay in this app's local storage."
        />
        <View
          onLayout={recordSection("general")}
          style={[
            shell.panel,
            data.settings.apiKeyValidated && styles.deepSeekValidated,
          ]}
        >
        <Field
          label="DEEPSEEK API KEY"
          value={data.settings.apiKey}
          onChangeText={updateApiKey}
          secureTextEntry
          placeholder="sk-…"
        />
        <Field
          label="API ENDPOINT"
          value={data.settings.apiUrl}
          onChangeText={(v) => update("apiUrl", v)}
        />
        <Field
          label="MODEL"
          value={data.settings.model}
          onChangeText={(v) => update("model", v)}
        />
        {data.settings.apiKey ? (
          <Text
            style={[
              styles.validationStatus,
              data.settings.apiKeyValidated && styles.validationSuccess,
              keyValidation === "invalid" && styles.error,
            ]}
          >
            {data.settings.apiKeyValidated
              ? "✓ DeepSeek API key validated"
              : keyValidation === "checking"
                ? "Validating DeepSeek API key…"
                : keyValidation === "invalid"
                  ? "Invalid DeepSeek API key."
                  : keyValidation === "error"
                    ? "Could not validate key. Check network and try editing it again."
                    : "Waiting to validate…"}
          </Text>
        ) : null}
        {data.settings.apiKeyValidated ? (
          <View style={styles.sentencesToggle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>Sentences menu</Text>
              <Text style={styles.help}>Show Sentences in the bottom menu.</Text>
            </View>
            <Switch
              value={data.settings.showSentencesTab}
              onValueChange={(value) => update("showSentencesTab", value)}
              trackColor={{ false: colors.line, true: colors.green }}
            />
          </View>
        ) : null}
      </View>
      <View onLayout={recordSection("audio")}>
        <TtsSettings settings={data.settings} update={update} />
      </View>
      <View style={styles.privacy}>
        <Text style={styles.icon}>⌁</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.privacyTitle}>Local-first by design</Text>
          <Text style={styles.help}>
            Vocabulary, generated sentences, indexes, SRS counters, and attempts
            remain on device. Only AI requests go to DeepSeek.
          </Text>
        </View>
      </View>
      <View onLayout={recordSection("vocabulary")}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Vocabulary</Text>
          <Text style={styles.help}>Build your deck from an HSK level or another source.</Text>
        </View>
        <View style={styles.autoWords}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Automatic word addition</Text>
            <Text style={styles.help}>
              Keep 20 learning words ready, adding them in order from HSK 1 onward.
            </Text>
          </View>
          <Switch
            value={data.settings.automaticWordAddition}
            onValueChange={setAutomaticWordAddition}
            trackColor={{ false: colors.line, true: colors.green }}
          />
        </View>
        <HskAdder
          existing={new Set(data.words.map((word) => word.hanzi))}
          onAdd={importWords}
        />
        <View style={styles.settingsAction}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>Other import options</Text>
            <Text style={styles.help}>
              Add words from screenshots or restore a QR backup.
            </Text>
          </View>
          <Button
            secondary
            label="Import"
            icon="scan-outline"
            onPress={() => router.push("/import")}
          />
        </View>
      </View>
      <View
        style={styles.settingsAction}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.privacyTitle}>Transfer vocabulary + SRS</Text>
          <Text style={styles.help}>
            Create one compact QR. Sentences excluded.
          </Text>
        </View>
        <Button
          secondary
          label="Show QR"
          icon="qr-code-outline"
          onPress={() => router.push("/qr-export")}
        />
      </View>
      <View style={styles.sectionHeading} onLayout={recordSection("cards")}>
        <View>
          <Text style={styles.sectionTitle}>Active card set</Text>
          <Text style={styles.help}>
            {activeWords.length} of 12 words · six cards per full round
          </Text>
        </View>
      </View>
      <View style={styles.activeSet}>
        {activeWords.map((word) => (
          <View key={word.id} style={styles.activeWord}>
            <Text style={styles.activeHanzi}>{word.hanzi}</Text>
            <Text style={styles.activeStep}>step {Math.min(3, word.cardSrsLevel + 1)}/3</Text>
          </View>
        ))}
      </View>
      <View style={styles.queue}>
        <Text style={styles.queueTitle}>UP NEXT</Text>
        <Text style={[styles.help, styles.queueHelp]}>
          Words enter the active set in this order as learning slots open.
        </Text>
        {queuedWords.length ? (
          queuedWords.map((word, index) => (
            <View
              key={word.id}
              style={[styles.queueRow, index > 0 && styles.tableBorder]}
            >
              <Text style={styles.queuePosition}>{index + 1}</Text>
              <Text style={styles.queueHanzi}>{word.hanzi}</Text>
              <View style={styles.wordCell}>
                <Text style={styles.queuePinyin}>{word.pinyin}</Text>
                <Text numberOfLines={1} style={styles.wordMeta}>
                  {word.russian}
                </Text>
              </View>
              <Text style={styles.queueScore}>
                ✓{word.cardSrsCorrect} ✗{word.cardSrsIncorrect}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No words are waiting for an active slot.</Text>
        )}
      </View>
      <View style={styles.sectionHeading} onLayout={recordSection("progress")}>
        <View>
          <Text style={styles.sectionTitle}>Word SRS progress</Text>
          <Text style={styles.help}>
            Sentence and card progress tracked independently
          </Text>
        </View>
      </View>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Pressable style={styles.wordCell} onPress={() => toggleSort("word")}>
            <Text style={[styles.headerCell, styles.wordHeader]}>{sortLabel("word", "WORD")}</Text>
          </Pressable>
          <Pressable onPress={() => toggleSort("sentences")}>
            <Text style={styles.headerCell}>{sortLabel("sentences", "SENTENCES")}</Text>
          </Pressable>
          <Pressable onPress={() => toggleSort("cards")}>
            <Text style={styles.headerCell}>{sortLabel("cards", "CARDS")}</Text>
          </Pressable>
        </View>
        {rankedWords.length ? (
          rankedWords.map((word, index) => (
            <View
              key={word.id}
              style={[styles.tableRow, index > 0 && styles.tableBorder]}
            >
              <View style={styles.wordCell}>
                <Text style={styles.hanzi}>{word.hanzi}</Text>
                <Text numberOfLines={1} style={styles.wordMeta}>
                  {word.pinyin} · {word.russian}
                </Text>
              </View>
              {stat(
                word.srsLevel,
                word.srsCorrect,
                word.srsIncorrect,
                word.srsDueAt,
              )}
              {stat(
                word.cardSrsLevel,
                word.cardSrsCorrect,
                word.cardSrsIncorrect,
                word.cardSrsDueAt,
              )}
            </View>
          ))
        ) : (
          <Text style={styles.empty}>
            Import vocabulary to see SRS progress.
          </Text>
        )}
      </View>
      </ScrollView>
    </View>
  );
}

type SettingsSection = "general" | "audio" | "vocabulary" | "cards" | "progress";
const SIDEBAR_WIDTH = 76;
const NAV_ITEM_HEIGHT = 70;
const SETTINGS_SECTIONS: {
  key: SettingsSection;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "general", label: "General", icon: "options-outline" },
  { key: "audio", label: "Audio", icon: "volume-high-outline" },
  { key: "vocabulary", label: "Words", icon: "book-outline" },
  { key: "cards", label: "Cards", icon: "albums-outline" },
  { key: "progress", label: "Progress", icon: "stats-chart-outline" },
];

function HskAdder({
  existing,
  onAdd,
}: {
  existing: Set<string>;
  onAdd: (words: ImportedWord[]) => number;
}) {
  const [level, setLevel] = useState(1);
  const [message, setMessage] = useState("");
  const dictionary = new Map(
    (dictionaryRows as [string, string, string][]).map(([hanzi, pinyin, russian]) => [
      hanzi,
      { hanzi, pinyin, russian },
    ]),
  );
  const cumulative = hskLevels as Record<string, string[]>;
  const lowerLevelWords = new Set(level > 1 ? cumulative[String(level - 1)] : []);
  const available = (cumulative[String(level)] ?? []).filter(
    (hanzi) => !lowerLevelWords.has(hanzi) && dictionary.has(hanzi) && !existing.has(hanzi),
  );
  const addWords = () => {
    const count = onAdd(available.slice(0, 7).map((hanzi) => dictionary.get(hanzi)!));
    setMessage(
      count
        ? `Added ${count} new HSK ${level} word${count === 1 ? "" : "s"}.`
        : `No more HSK ${level} words are available.`,
    );
  };

  return (
    <View style={styles.hskPanel}>
      <Text style={styles.privacyTitle}>Add HSK words</Text>
      <Text style={styles.help}>Choose a level and add seven new words at a time.</Text>
      <View style={styles.hskLevels}>
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <Choice
            key={value}
            label={`HSK ${value}`}
            selected={level === value}
            onPress={() => {
              setLevel(value);
              setMessage("");
            }}
          />
        ))}
      </View>
      <Text style={styles.hskRemaining}>
        {available.length} HSK {level} words remaining
      </Text>
      <View style={styles.hskButton}>
        <Button
          label={`Add 7 HSK ${level} words`}
          icon="add-circle-outline"
          disabled={!available.length}
          onPress={addWords}
        />
      </View>
      {message ? <Text style={styles.hskMessage}>{message}</Text> : null}
    </View>
  );
}

function TtsSettings({
  settings,
  update,
}: {
  settings: SettingsData;
  update: <K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K],
  ) => void;
}) {
  const provider = getTtsProvider(settings);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  useEffect(
    () => subscribeToVoices(() => setVoices(provider.voices())),
    [provider],
  );
  return (
    <View style={[shell.panel, styles.ttsPanel]}>
      <Text style={styles.sectionTitle}>Mandarin audio</Text>
      <Text style={styles.help}>
        Browser speech is free and stays on-device.
      </Text>
      {!provider.supported() ? (
        <Text style={styles.error}>Speech unavailable in this browser.</Text>
      ) : (
        <>
          <Text style={[styles.label, styles.ttsLabel]}>SPEED</Text>
          <View style={styles.chips}>
            {[0.7, 0.85, 1, 1.15].map((rate) => (
              <Choice
                key={rate}
                label={`${rate}×`}
                selected={settings.ttsRate === rate}
                onPress={() => update("ttsRate", rate)}
              />
            ))}
          </View>
          <Text style={[styles.label, styles.ttsLabel]}>MANDARIN VOICE</Text>
          <View style={styles.chips}>
            <Choice
              label="Automatic"
              selected={!settings.ttsVoiceURI}
              onPress={() => update("ttsVoiceURI", "")}
            />
            {voices.map((voice) => (
              <Choice
                key={voice.id}
                label={`${voice.name} (${voice.language})`}
                selected={settings.ttsVoiceURI === voice.id}
                onPress={() => update("ttsVoiceURI", voice.id)}
              />
            ))}
          </View>
          <View style={styles.testButton}>
            <Button
              secondary
              icon="volume-high-outline"
              label="Test voice"
              onPress={() => speakMandarin("你好，我正在学习中文。", settings)}
            />
          </View>
        </>
      )}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#9A9D95"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  settingsContent: { paddingTop: 32 },
  settingsScroll: { marginLeft: SIDEBAR_WIDTH },
  sideMenu: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
    width: SIDEBAR_WIDTH,
    paddingTop: 18,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  sideMenuItem: {
    width: SIDEBAR_WIDTH,
    height: NAV_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sideMenuLabel: {
    color: "#8B8E86",
    fontSize: 10,
    fontWeight: "700",
  },
  sideMenuLabelActive: { color: colors.green },
  sectionIndicator: {
    position: "absolute",
    zIndex: 1,
    top: 18 + NAV_ITEM_HEIGHT - 3,
    right: 12,
    width: SIDEBAR_WIDTH - 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.green,
  },
  pressed: { opacity: 0.55 },
  deepSeekValidated: { backgroundColor: "#EAF7ED", borderColor: "#AED8B7" },
  validationStatus: { color: colors.muted, marginTop: -4, marginBottom: 14 },
  validationSuccess: { color: colors.green, fontWeight: "700" },
  sentencesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: "#C8E4CE",
    paddingTop: 16,
  },
  settingsAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
  },
  hskPanel: {
    padding: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
  },
  autoWords: { flexDirection: "row", alignItems: "center", gap: 14, padding: 17, marginBottom: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 15 },
  hskLevels: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  hskRemaining: { color: colors.muted, fontSize: 12, marginTop: 14 },
  hskButton: { alignSelf: "flex-start", marginTop: 12 },
  hskMessage: { color: colors.green, fontWeight: "700", marginTop: 12 },
  ttsPanel: { marginTop: 14 },
  ttsLabel: { marginTop: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.paper,
  },
  choiceSelected: { borderColor: colors.green, backgroundColor: colors.pale },
  choiceText: { color: colors.muted, fontSize: 13 },
  choiceTextSelected: { color: colors.green, fontWeight: "800" },
  testButton: { marginTop: 16, alignSelf: "flex-start" },
  error: { color: colors.red, marginTop: 12 },
  field: { marginBottom: 18 },
  label: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    height: 50,
    color: colors.ink,
    fontSize: 15,
  },
  privacy: {
    flexDirection: "row",
    gap: 13,
    marginTop: 18,
    padding: 17,
    backgroundColor: colors.pale,
    borderRadius: 15,
  },
  icon: { color: colors.green, fontSize: 24 },
  privacyTitle: { color: colors.ink, fontWeight: "800" },
  help: { color: colors.muted, marginTop: 5, lineHeight: 20 },
  sectionHeading: { marginTop: 30, marginBottom: 11 },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  activeSet: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  activeWord: { backgroundColor: colors.pale, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  activeHanzi: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  activeStep: { color: colors.green, fontSize: 10, marginTop: 2 },
  queue: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: colors.card,
    overflow: "hidden",
    paddingTop: 14,
  },
  queueTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
    paddingHorizontal: 14,
  },
  queueHelp: { paddingHorizontal: 14, paddingBottom: 8 },
  queueRow: {
    minHeight: 56,
    marginHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  queuePosition: { width: 22, color: colors.muted, fontSize: 11 },
  queueHanzi: { width: 52, color: colors.ink, fontSize: 20, fontWeight: "800" },
  queuePinyin: { color: colors.green, fontSize: 12, fontWeight: "700" },
  queueScore: { color: colors.muted, fontSize: 9 },
  table: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  tableRow: {
    minHeight: 62,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  tableHeader: { minHeight: 38, backgroundColor: colors.pale },
  tableBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  headerCell: {
    width: 88,
    textAlign: "right",
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  wordHeader: { width: "auto", textAlign: "left" },
  wordCell: { flex: 1, minWidth: 0 },
  hanzi: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  wordMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
    paddingRight: 8,
  },
  srsCell: { width: 88, alignItems: "flex-end" },
  level: { color: colors.green, fontWeight: "800", fontSize: 12 },
  score: { color: colors.muted, fontSize: 11, marginTop: 3 },
  empty: { color: colors.muted, textAlign: "center", padding: 24 },
});
