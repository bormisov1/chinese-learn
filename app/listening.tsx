import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useStore } from "@/context";
import { Sentence, Word } from "@/types";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { colors } from "@/theme";
import { speakMandarin } from "@/tts";

type ListeningItem =
  | { kind: "word"; id: string; chinese: string; pinyin: string; russian: string; word: Word }
  | { kind: "sentence"; id: string; chinese: string; pinyin: string; russian: string; sentence: Sentence };

export default function Listening() {
  const { data } = useStore();
  const items = useMemo<ListeningItem[]>(() => {
    const words: ListeningItem[] = data.words.map((word) => ({
      kind: "word", id: `word:${word.id}`, chinese: word.hanzi,
      pinyin: word.pinyin, russian: word.russian, word,
    }));
    const sentences: ListeningItem[] = data.sentences.map((sentence) => ({
      kind: "sentence", id: `sentence:${sentence.id}`,
      chinese: sentence.chinese.replaceAll(" ", ""), pinyin: sentence.pinyin,
      russian: sentence.russian, sentence,
    }));
    return [...words, ...sentences].sort((a, b) => {
      const aSeen = a.kind === "word" ? a.word.wordShownCount : a.sentence.sentenceShownCount;
      const bSeen = b.kind === "word" ? b.word.wordShownCount : b.sentence.sentenceShownCount;
      return aSeen - bSeen || a.id.localeCompare(b.id);
    });
  }, [data.words, data.sentences]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = items[position % Math.max(1, items.length)];

  if (!item) return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow="Listening practice" title="Listen. Recognize. Recall." subtitle="Import vocabulary to begin." />
    </ScrollView>
  );

  const next = () => { setPosition((value) => value + 1); setRevealed(false); };
  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow={`Listening · ${item.kind}`} title="Listen. Recognize. Recall." subtitle={`${position % items.length + 1} of ${items.length} · words and sentences mixed`} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Listen to ${item.chinese}`}
        onPress={() => speakMandarin(item.chinese, data.settings)}
        style={styles.card}
      >
        <Text style={styles.side}>{item.kind === "word" ? "WORD" : "SENTENCE"}</Text>
        <Text style={styles.chinese}>{item.chinese}</Text>
        <View style={styles.listenRow}>
          <SpeakerButton text={item.chinese} settings={data.settings} size={24} />
          <Text style={styles.listenHint}>Tap the card to listen</Text>
        </View>
        {revealed ? (
          <View style={styles.answer}>
            <Text style={styles.pinyin}>{item.pinyin}</Text>
            <Text style={styles.russian}>{item.russian}</Text>
          </View>
        ) : <Text style={styles.hidden}>Meaning hidden until you reveal it</Text>}
      </Pressable>
      {revealed
        ? <Button label="Next" icon="arrow-forward" onPress={next} />
        : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 340, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 24, marginBottom: 18, alignItems: "center", justifyContent: "center" },
  side: { color: colors.coral, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 20 },
  chinese: { color: colors.ink, fontSize: 44, lineHeight: 58, fontWeight: "800", textAlign: "center" },
  listenRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  listenHint: { color: colors.muted, fontSize: 14 },
  hidden: { color: colors.muted, marginTop: 28, fontStyle: "italic" },
  answer: { width: "100%", borderTopWidth: 1, borderTopColor: colors.line, marginTop: 26, paddingTop: 22, alignItems: "center", gap: 8 },
  pinyin: { color: colors.green, fontSize: 20, fontWeight: "700", textAlign: "center" },
  russian: { color: colors.ink, fontSize: 20, lineHeight: 28, textAlign: "center" },
});
