import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";
import { Settings } from "./types";
import { getTtsProvider, speakMandarin } from "./tts";
import { getHskLevel } from "./hsk-vocabulary";

export function Header({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.header}>
      {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}
export function Button({
  label,
  onPress,
  icon,
  secondary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={secondary ? colors.green : colors.white}
        />
      )}
      <Text style={[s.buttonText, secondary && { color: colors.green }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function SpeakerButton({
  text,
  settings,
  size = 18,
  accessibilityLabel,
}: {
  text: string;
  settings: Settings;
  size?: number;
  accessibilityLabel?: string;
}) {
  const disabled = !text || !getTtsProvider(settings).supported();
  const buttonSize = Math.max(34, size + 16);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Play ${text}`}
      disabled={disabled}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        speakMandarin(text, settings);
      }}
      style={({ pressed }) => [
        s.speaker,
        { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
        (pressed || disabled) && { opacity: 0.4 },
      ]}
    >
      <Ionicons name="volume-high-outline" size={size} color={colors.green} />
    </Pressable>
  );
}

export function HskBadge({ hanzi }: { hanzi: string }) {
  const level = getHskLevel(hanzi);
  if (!level) return null;
  return (
    <View style={s.hskBadge} accessibilityLabel={`HSK level ${level}`}>
      <Text style={s.hskBadgeText}>HSK-{level}</Text>
    </View>
  );
}
export const shell = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 18,
  },
});
const s = StyleSheet.create({
  header: { paddingTop: 28, paddingBottom: 24 },
  eyebrow: {
    color: colors.coral,
    fontSize: 12,
    letterSpacing: 1.8,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 7,
  },
  title: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.8,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  button: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 19,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondary: {
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: "#CCDCD1",
  },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  speaker: {
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  hskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: "#CCDCD1",
  },
  hskBadgeText: {
    color: colors.green,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
