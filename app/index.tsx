import { displayTranslation, Text } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useStore } from "@/context";
import { Button, Header, shell } from "@/ui";
import { colors } from "@/theme";
import { CARD_GRADUATION_LEVEL } from "@/card-srs";
import { roundsByDay } from "@/round-history";

export default function Home() {
  const { data, error } = useStore();
  const [showApiTip, setShowApiTip] = useState(false);
  const passedWords = data.words.filter(
    (word) => word.cardSrsLevel >= CARD_GRADUATION_LEVEL,
  ).length;
  const passedProgress = `${passedWords} ${passedWords === 1 ? "word" : "words"} passed · ${data.cardRound} ${data.cardRound === 1 ? "round" : "rounds"} passed`;
  const aiEnabled = data.settings.apiKeyValidated;
  const roundDays = roundsByDay(data.roundCompletions);
  const sevenDayRounds = roundDays.reduce((sum, item) => sum + item.count, 0);
  const maxDailyRounds = Math.max(1, ...roundDays.map((item) => item.count));
  const modes = [
    { label: "Cards", icon: "albums-outline", href: "/cards", enabled: true },
    { label: "Sentences", icon: "create-outline", href: "/practice", enabled: aiEnabled },
    { label: "Listening", icon: "headset-outline", href: "/listening", enabled: aiEnabled },
    { label: "Mix", icon: "shuffle-outline", href: "/mix", enabled: aiEnabled },
  ] as const;
  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow="Your Mandarin study" title={"Learn what matters.\nRemember what you learn."} subtitle="A private vocabulary deck shaped around the words you choose." />
      <View style={styles.hero}>
        <Text style={styles.heroMark}>好</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{data.words.length ? `${data.words.length} words in your deck` : "Start with your own words"}</Text>
          <Text style={styles.heroText}>{data.words.length ? passedProgress : "Import a screenshot or paste a vocabulary list. Nothing is hardcoded."}</Text>
        </View>
      </View>
      <View style={styles.roundChart}>
        <View style={styles.chartHeading}>
          <View>
            <Text style={styles.chartEyebrow}>ROUNDS</Text>
            <Text style={styles.chartTitle}>Last 7 days</Text>
          </View>
          <View style={styles.chartTotal}>
            <Text style={styles.chartTotalNumber}>{sevenDayRounds}</Text>
            <Text style={styles.chartTotalLabel}>completed</Text>
          </View>
        </View>
        <View style={styles.chartBars}>
          {roundDays.map((item) => {
            const height = item.count
              ? Math.max(8, (item.count / maxDailyRounds) * 70)
              : 3;
            return (
              <View key={item.date} style={styles.chartDay}>
                <Text style={styles.chartCount}>
                  {item.count || ""}
                </Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      item.today && styles.chartBarToday,
                      { height },
                    ]}
                  />
                </View>
                <Text style={[styles.chartLabel, item.today && styles.chartLabelToday]}>
                  {new Date(item.date).toLocaleDateString(undefined, {
                    weekday: "narrow",
                  })}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!data.words.length ? (
        <View style={styles.importAction}>
          <Button label="Import vocabulary" icon="scan-outline" onPress={() => router.push("/import")} />
        </View>
      ) : null}
      <View style={styles.modeGrid}>
        {modes.map((mode) => (
          <Pressable
            key={mode.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: !mode.enabled }}
            accessibilityHint={mode.enabled ? `Open ${mode.label}` : "Requires a validated DeepSeek API key"}
            onPress={() => {
              if (mode.enabled) router.push(mode.href);
              else setShowApiTip(true);
            }}
            style={({ pressed }) => [
              styles.mode,
              !mode.enabled && styles.modeDisabled,
              pressed && styles.modePressed,
            ]}
          >
            <Ionicons
              name={mode.icon}
              size={25}
              color={mode.enabled ? colors.green : colors.muted}
            />
            <Text style={[styles.modeLabel, !mode.enabled && styles.modeLabelDisabled]}>
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {showApiTip && !aiEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings to add a DeepSeek API key"
          onPress={() => router.push("/settings")}
          style={styles.apiTip}
        >
          <Ionicons name="key-outline" size={20} color={colors.coral} />
          <Text style={styles.apiTipText}>
            Add and validate your DeepSeek API key in Settings to unlock Sentences, Listening, and Mix.
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.coral} />
        </Pressable>
      ) : null}
      <Text style={styles.section}>RECENT VOCABULARY</Text>
      <View style={shell.panel}>
        {data.words.length ? data.words.slice(-5).reverse().map((word, index) => (
          <View key={word.id} style={[styles.word, index > 0 && styles.border]}>
            <Text style={styles.hanzi}>{word.hanzi}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pinyin}>{word.pinyin}</Text>
              <Text style={styles.russian}>{displayTranslation(word.russian, data.settings.language)}</Text>
              <Text style={styles.guessStats}>✓ {word.cardSrsCorrect} · ✗ {word.cardSrsIncorrect}</Text>
            </View>
            <Text style={styles.count}>{word.exampleCount} examples</Text>
          </View>
        )) : <Text style={styles.empty}>Your imported words will appear here.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.green, borderRadius: 22, padding: 22, flexDirection: "row", alignItems: "center", gap: 18 },
  heroMark: { width: 70, height: 70, textAlign: "center", textAlignVertical: "center", fontSize: 43, color: colors.white, backgroundColor: "#496C5D", borderRadius: 18 },
  heroTitle: { color: colors.white, fontWeight: "800", fontSize: 19 },
  heroText: { color: "#DCE9E2", marginTop: 6, lineHeight: 20 },
  roundChart: {
    marginTop: 14,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chartHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  chartEyebrow: {
    color: colors.coral,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  chartTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 3 },
  chartTotal: { alignItems: "flex-end" },
  chartTotalNumber: { color: colors.green, fontSize: 28, lineHeight: 30, fontWeight: "800" },
  chartTotalLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chartBars: {
    height: 112,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  chartDay: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  chartCount: { height: 17, color: colors.muted, fontSize: 10, fontWeight: "700" },
  chartTrack: {
    width: "100%",
    maxWidth: 34,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.pale,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBar: { width: "100%", borderRadius: 10, backgroundColor: colors.green },
  chartBarToday: { backgroundColor: colors.coral },
  chartLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 6 },
  chartLabelToday: { color: colors.coral, fontWeight: "900" },
  importAction: { marginTop: 18 },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 22 },
  mode: {
    minWidth: "45%",
    flexBasis: "45%",
    flexGrow: 1,
    minHeight: 94,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CCDCD1",
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  modeDisabled: { backgroundColor: "#ECEAE4", borderColor: colors.line },
  modePressed: { opacity: 0.65 },
  modeLabel: { color: colors.green, fontSize: 15, fontWeight: "800" },
  modeLabelDisabled: { color: colors.muted },
  apiTip: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8C9BD",
    backgroundColor: "#FFF1EC",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  apiTipText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
  section: { fontSize: 11, letterSpacing: 1.5, fontWeight: "800", color: colors.muted, marginTop: 28, marginBottom: 10 },
  word: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 14 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  hanzi: { fontSize: 27, fontWeight: "700", color: colors.ink, width: 70 },
  pinyin: { color: colors.green, fontWeight: "700" },
  russian: { color: colors.muted, marginTop: 3 },
  guessStats: { color: colors.muted, fontSize: 9, marginTop: 3 },
  count: { color: colors.muted, fontSize: 11 },
  empty: { color: colors.muted, textAlign: "center", padding: 20 },
  error: { color: colors.red, marginBottom: 12 },
});
