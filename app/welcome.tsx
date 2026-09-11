import { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "@/context";
import { colors } from "@/theme";
import { LANGUAGES, Text, suggestedLanguage } from "@/i18n";
import type { AppLanguage } from "@/types";

export default function Welcome() {
  const { data, dictionaryError, switchingLanguage, selectLanguage, setAutomaticWordAddition } = useStore();
  const suggestion = suggestedLanguage();
  const [language, setLanguage] = useState<AppLanguage>(data.languageSelected ? data.settings.language : suggestion);
  if (!data.languageSelected) return (
    <SafeAreaView style={styles.page}>
      <View style={styles.content}>
        <Text style={styles.title}>Choose your language</Text>
        <Text style={styles.subtitle}>You can change it later in Settings.</Text>
        <View style={styles.languages} accessibilityRole="radiogroup">
          {LANGUAGES.map(item => <Pressable key={item.code} accessibilityRole="radio" accessibilityState={{ checked: language === item.code, disabled: switchingLanguage !== null }} disabled={switchingLanguage !== null} onPress={() => setLanguage(item.code)} style={[styles.language, language === item.code && styles.languageSelected, switchingLanguage !== null && styles.disabled]}>
            <Text style={styles.optionTitle}>{item.nativeLabel}</Text>
            {item.code === suggestion ? <Text style={styles.suggestion}>Suggested</Text> : null}
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: switchingLanguage !== null }} disabled={switchingLanguage !== null} onPress={() => { void selectLanguage(language); }} style={[styles.continue, switchingLanguage !== null && styles.disabled]}>
          {switchingLanguage ? <ActivityIndicator color={colors.white} /> : <Text style={styles.continueText}>Continue</Text>}
        </Pressable>
        {switchingLanguage ? <Text style={styles.status}>Downloading dictionary…</Text> : null}
        {dictionaryError ? <Text style={styles.error}>{dictionaryError} Your language was not changed. Try again.</Text> : null}
      </View>
    </SafeAreaView>
  );
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>How would you like to build your vocabulary?</Text>
        <View style={styles.options}>
          <Mode
            icon="sparkles-outline"
            title="Automatic"
            badge="RECOMMENDED"
            description="Start with 20 HSK words. New words arrive in order as you learn, from HSK 1 through HSK 6."
            onPress={() => setAutomaticWordAddition(true, true)}
          />
          <Mode
            icon="hand-left-outline"
            title="Manual"
            description="Keep adding words yourself from screenshots, lists, or the HSK picker."
            onPress={() => setAutomaticWordAddition(false, true)}
          />
        </View>
        <Text style={styles.note}>You can change this anytime in Settings.</Text>
      </View>
    </SafeAreaView>
  );
}

function Mode({ icon, title, badge, description, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; badge?: string; description: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={styles.icon}><Ionicons name={icon} size={24} color={colors.green} /></View>
      <View style={styles.copy}>
        <View style={styles.optionHeading}>
          <Text style={styles.optionTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Ionicons name="arrow-forward" size={22} color={colors.green} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  title: { color: colors.ink, fontSize: 36, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 24, marginTop: 8, maxWidth: 480 },
  options: { gap: 14, marginTop: 36, maxWidth: 620 },
  option: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.card },
  pressed: { opacity: 0.65 },
  icon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.pale },
  copy: { flex: 1 },
  optionHeading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  optionTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  badge: { color: colors.green, backgroundColor: colors.pale, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  description: { color: colors.muted, lineHeight: 20, marginTop: 5 },
  note: { color: colors.muted, marginTop: "auto", fontSize: 12 },
  languages: { gap: 9, marginTop: 28 },
  language: { minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  languageSelected: { borderColor: colors.green, backgroundColor: colors.pale },
  suggestion: { color: colors.green, fontSize: 11, fontWeight: "800" },
  continue: { minHeight: 52, borderRadius: 14, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginTop: 18 },
  continueText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  status: { color: colors.muted, marginTop: 12, textAlign: "center" },
  error: { color: colors.red, marginTop: 12, textAlign: "center", lineHeight: 20 },
});
