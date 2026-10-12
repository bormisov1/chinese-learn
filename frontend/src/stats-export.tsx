import { Fragment, useRef, useState, type RefObject } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import * as Sharing from "expo-sharing";
import { cacheDirectory, writeAsStringAsync } from "expo-file-system/legacy";
import { Text, useTranslation } from "./i18n";
import { colors } from "./theme";

export type DailyStat = { date: number; count: number };
const WIDTH = 1080;
const HEIGHT = 1120;
const filename = () => `hanzi-deck-stats-${new Date().toISOString().slice(0, 10)}.png`;

function StatBars({ days, top, color, label }: { days: DailyStat[]; top: number; color: string; label: string }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  return <>
    <SvgText x={104} y={top} fill="#DCE9E2" fontSize={32} fontWeight="700">{label}</SvgText>
    <SvgText x={976} y={top} fill="#FFFFFF" fontSize={48} fontWeight="800" textAnchor="end">{total}</SvgText>
    <Line x1={104} y1={top + 228} x2={976} y2={top + 228} stroke="#8BAA9A" strokeOpacity={0.4} strokeWidth={2} />
    {days.map((day, index) => {
      const x = 116 + index * 125;
      const barHeight = day.count ? Math.max(12, Math.round(day.count / max * 142)) : 4;
      const labelDate = new Date(day.date).toLocaleDateString(undefined, { weekday: "short" });
      return <Fragment key={day.date}>
        <Rect x={x} y={top + 219 - barHeight} width={62} height={barHeight} rx={12} fill={color} />
        <SvgText x={x + 31} y={top + 207 - barHeight} fill="#FFFFFF" fontSize={25} fontWeight="700" textAnchor="middle">{day.count || ""}</SvgText>
        <SvgText x={x + 31} y={top + 267} fill="#DCE9E2" fontSize={22} textAnchor="middle">{labelDate}</SvgText>
      </Fragment>;
    })}
  </>;
}

function StatsGraphic({ rounds, graduations, graphicRef }: {
  rounds: DailyStat[]; graduations: DailyStat[]; graphicRef: RefObject<Svg | null>;
}) {
  const t = useTranslation();
  const start = new Date(rounds[0]?.date ?? Date.now());
  const end = new Date(rounds.at(-1)?.date ?? Date.now());
  const range = `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  return <Svg ref={graphicRef} width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
    {/* The outside stays transparent so this PNG can sit over a story photo. */}
    <Rect x={42} y={42} width={996} height={1036} rx={62} fill="#173B31" />
    <SvgText x={104} y={143} fill="#A9DBC4" fontSize={28} fontWeight="800" letterSpacing={5}>HANZI DECK</SvgText>
    <SvgText x={104} y={225} fill="#FFFFFF" fontSize={58} fontWeight="800">{t("7-day learning stats")}</SvgText>
    <SvgText x={104} y={274} fill="#DCE9E2" fontSize={27}>{range}</SvgText>
    <StatBars days={rounds} top={370} color="#7FD0A6" label={t("Rounds completed")} />
    <StatBars days={graduations} top={725} color="#F4AB80" label={t("Words graduated")} />
    <SvgText x={104} y={1030} fill="#DCE9E2" fontSize={24}>{t("From the active word pool")}</SvgText>
  </Svg>;
}

export function StatsExport({ rounds, graduations }: { rounds: DailyStat[]; graduations: DailyStat[] }) {
  const t = useTranslation();
  const graphicRef = useRef<Svg>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!graphicRef.current || busy) return;
    setBusy(true);
    setError("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(t("Could not render the image."))), 15000);
        graphicRef.current?.toDataURL((value) => {
          clearTimeout(timer);
          value ? resolve(value) : reject(new Error(t("Could not render the image.")));
        }, { width: WIDTH, height: HEIGHT });
      });
      const name = filename();
      if (Platform.OS === "web") {
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const file = new File([bytes], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: t("7-day learning stats") });
        } else {
          const url = URL.createObjectURL(file);
          const link = document.createElement("a");
          link.href = url;
          link.download = name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } else {
        if (!cacheDirectory) throw new Error(t("The device file system is unavailable."));
        const uri = `${cacheDirectory}${name}`;
        await writeAsStringAsync(uri, base64, { encoding: "base64" });
        if (!(await Sharing.isAvailableAsync())) throw new Error(t("Sharing is unavailable on this device."));
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: t("7-day learning stats") });
      }
    } catch (reason) {
      if ((reason as Error)?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.openButton}>
      <Text style={styles.openText}>{t("Export transparent PNG")}</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("Preview your stats image")}</Text>
          <Text style={styles.hint}>{t("The area outside the chart is transparent for stories.")}</Text>
          <View style={styles.preview}><StatsGraphic rounds={rounds} graduations={graduations} graphicRef={graphicRef} /></View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.secondary}><Text style={styles.secondaryText}>{t("Close")}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? t("Preparing…") : t("Save or share PNG")}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  openButton: { alignSelf: "flex-start", marginTop: 16, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.pale },
  openText: { color: colors.green, fontWeight: "800", fontSize: 13 },
  scrim: { flex: 1, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "#17251FCC" },
  sheet: { width: "100%", maxWidth: 430, maxHeight: "96%", padding: 18, borderRadius: 22, backgroundColor: colors.card, alignItems: "center" },
  title: { color: colors.ink, fontSize: 19, fontWeight: "800", alignSelf: "flex-start" },
  hint: { color: colors.muted, fontSize: 13, marginTop: 5, alignSelf: "flex-start" },
  preview: { width: "100%", maxWidth: 300, aspectRatio: WIDTH / HEIGHT, marginVertical: 14, backgroundColor: "#D2D0C9", borderRadius: 12 },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  secondary: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontWeight: "700" },
  primary: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: colors.green, alignItems: "center" },
  primaryText: { color: colors.white, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  error: { color: colors.red, marginBottom: 8 },
});
