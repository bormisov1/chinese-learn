import { Text } from "./i18n";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { colors } from "./theme";
import { Settings } from "./types";
import { getTtsProvider, speakMandarin } from "./tts";
import { getHskLevel } from "./hsk-vocabulary";
import type { ResolvedPronunciation } from "./pronunciation";

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
  pronunciation,
  settings,
  size = 18,
  accessibilityLabel,
}: {
  pronunciation: ResolvedPronunciation;
  settings: Settings;
  size?: number;
  accessibilityLabel?: string;
}) {
  const disabled = !pronunciation.hanzi || !pronunciation.pinyin || !getTtsProvider(settings).supported();
  const buttonSize = Math.max(34, size + 16);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Play ${pronunciation.hanzi}`}
      disabled={disabled}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        speakMandarin(pronunciation, settings);
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

const TRANSLATION_FONT_SIZE = 31;
const TRANSLATION_LINE_HEIGHT = 39;
// Keep the card prompt readable on narrow iPhone widths.  Going as low as
// 0.75 made the prompt look noticeably soft on iOS, especially next to the
// icon rendered on the answer face.
const MINIMUM_TRANSLATION_SCALE = 0.9;

export function FittedTranslation({ text }: { text: string }) {
  const [availableWidth, setAvailableWidth] = React.useState(0);
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const requiredScale = measuredWidth && availableWidth
    ? (availableWidth * 4) / measuredWidth
    : 1;
  const scale = Math.max(
    MINIMUM_TRANSLATION_SCALE,
    Math.min(1, requiredScale),
  );
  const contentWidth = Math.max(
    availableWidth,
    measuredWidth ? (measuredWidth * scale) / 4 : availableWidth,
  );
  const canScroll = contentWidth > availableWidth + 1;

  React.useEffect(() => setMeasuredWidth(0), [text]);

  return (
    <View
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={s.translationViewport}
    >
      <Text
        aria-hidden
        allowFontScaling={false}
        onTextLayout={(event) => {
          const width = event.nativeEvent.lines.reduce(
            (total, line) => total + line.width,
            0,
          );
          if (Math.abs(width - measuredWidth) > 1) setMeasuredWidth(width);
        }}
        style={s.translationMeasure}
      >
        {text}
      </Text>
      <ScrollView
        horizontal
        bounces={false}
        overScrollMode="never"
        scrollEnabled={canScroll}
        showsHorizontalScrollIndicator={canScroll}
        contentContainerStyle={s.translationScrollContent}
      >
        <Text
          numberOfLines={4}
          allowFontScaling={false}
          style={[
            s.translationText,
            {
              width: contentWidth || "100%",
              fontSize: TRANSLATION_FONT_SIZE * scale,
              lineHeight: TRANSLATION_LINE_HEIGHT * scale,
            },
          ]}
        >
          {text}
        </Text>
      </ScrollView>
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
    flexShrink: 0,
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
  translationViewport: {
    width: "100%",
    maxHeight: TRANSLATION_LINE_HEIGHT * 4,
    marginTop: 20,
    overflow: "hidden",
  },
  translationMeasure: {
    position: "absolute",
    width: "100%",
    opacity: 0,
    fontSize: TRANSLATION_FONT_SIZE,
    lineHeight: TRANSLATION_LINE_HEIGHT,
    fontWeight: "700",
  },
  translationScrollContent: { minWidth: "100%", alignItems: "center" },
  translationText: {
    color: colors.ink,
    fontWeight: "700",
    textAlign: "center",
  },
});
