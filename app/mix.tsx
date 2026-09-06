import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useStore } from "@/context";
import { Button, Header, shell, SpeakerButton } from "@/ui";
import { colors } from "@/theme";
import { speakMandarin } from "@/tts";

type Mode = "word" | "sentence" | "listening";
type MixItem = { id: string; mode: Mode; chinese: string; pinyin: string; russian: string };

export default function Mix() {
  const { data } = useStore();
  const items = useMemo<MixItem[]>(() => {
    const words = [...data.words].sort((a, b) => a.wordShownCount - b.wordShownCount);
    const sentences = [...data.sentences].sort((a, b) => a.sentenceShownCount - b.sentenceShownCount);
    const count = Math.max(words.length, sentences.length);
    const mixed: MixItem[] = [];
    for (let index = 0; index < count; index += 1) {
      const word = words[index % Math.max(1, words.length)];
      const sentence = sentences[index % Math.max(1, sentences.length)];
      if (word) mixed.push({ id: `word:${word.id}`, mode: "word", chinese: word.hanzi, pinyin: word.pinyin, russian: word.russian });
      if (sentence) mixed.push({ id: `sentence:${sentence.id}`, mode: "sentence", chinese: sentence.chinese.replaceAll(" ", ""), pinyin: sentence.pinyin, russian: sentence.russian });
      const listeningSource = index % 2 === 0 ? sentence : word;
      if (listeningSource) mixed.push({
        id: `listening:${listeningSource.id}`,
        mode: "listening",
        chinese: "hanzi" in listeningSource ? listeningSource.hanzi : listeningSource.chinese.replaceAll(" ", ""),
        pinyin: listeningSource.pinyin,
        russian: listeningSource.russian,
      });
    }
    return mixed;
  }, [data.words, data.sentences]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = items[position % Math.max(1, items.length)];

  if (!item) return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow="Mixed practice" title="Everything in one round." subtitle="Import vocabulary to begin." />
    </ScrollView>
  );

  const listening = item.mode === "listening";
  const next = () => { setPosition((value) => value + 1); setRevealed(false); };
  return (
    <ScrollView style={shell.page} contentContainerStyle={shell.content}>
      <Header eyebrow={`Mix · ${item.mode}`} title="Everything in one round." subtitle={`${position % items.length + 1} of ${items.length} · words, sentences, and listening`} />
      <Pressable
        accessibilityRole={listening ? "button" : undefined}
        accessibilityLabel={listening ? `Listen to ${item.chinese}` : undefined}
        onPress={listening ? () => speakMandarin(item.chinese, data.settings) : undefined}
        style={styles.card}
      >
        <Text style={styles.side}>{item.mode.toUpperCase()}</Text>
        <Text style={listening ? styles.chinese : styles.prompt}>
          {listening ? item.chinese : item.russian}
        </Text>
        {listening ? (
          <View style={styles.listenRow}>
            <SpeakerButton text={item.chinese} settings={data.settings} size={24} />
            <Text style={styles.hint}>Tap the card to listen</Text>
          </View>
        ) : null}
        {revealed ? (
          <View style={styles.answer}>
            {!listening ? <Text style={styles.chinese}>{item.chinese}</Text> : null}
            <Text style={styles.pinyin}>{item.pinyin}</Text>
            {listening ? <Text style={styles.translation}>{item.russian}</Text> : null}
          </View>
        ) : <Text style={styles.hint}>Answer hidden until you reveal it</Text>}
      </Pressable>
      {revealed
        ? <Button label="Next mixed card" icon="arrow-forward" onPress={next} />
        : <Button label="Reveal answer" icon="eye-outline" onPress={() => setRevealed(true)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 340, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 24, marginBottom: 18, alignItems: "center", justifyContent: "center" },
  side: { color: colors.coral, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 20 },
  prompt: { color: colors.ink, fontSize: 27, lineHeight: 38, fontWeight: "700", textAlign: "center" },
  chinese: { color: colors.ink, fontSize: 40, lineHeight: 54, fontWeight: "800", textAlign: "center" },
  listenRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  hint: { color: colors.muted, marginTop: 24, fontSize: 14 },
  answer: { width: "100%", borderTopWidth: 1, borderTopColor: colors.line, marginTop: 26, paddingTop: 22, alignItems: "center", gap: 8 },
  pinyin: { color: colors.green, fontSize: 20, fontWeight: "700", textAlign: "center" },
  translation: { color: colors.ink, fontSize: 20, lineHeight: 28, textAlign: "center" },
});
