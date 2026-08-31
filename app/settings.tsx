import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '@/context';
import { colors } from '@/theme';
import { Header, shell } from '@/ui';
import { Button } from '@/ui';
import { router } from 'expo-router';

export default function Settings() {
  const { data, patch } = useStore();
  const update = (key: 'apiKey' | 'apiUrl' | 'model', value: string) => patch(d => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const now = Date.now();
  const rankedWords = [...data.words].sort((a, b) => b.srsIncorrect + b.cardSrsIncorrect - a.srsIncorrect - a.cardSrsIncorrect || a.hanzi.localeCompare(b.hanzi));
  const stat = (level: number, correct: number, incorrect: number, dueAt: number) => <View style={styles.srsCell}><Text style={styles.level}>L{level}{dueAt <= now ? ' · due' : ''}</Text><Text style={styles.score}>✓{correct}  ✗{incorrect}</Text></View>;

  return <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
    <Header eyebrow="Configuration" title="Settings" subtitle="Your key and study data stay in this app's local storage."/>
    <View style={shell.panel}><Field label="DEEPSEEK API KEY" value={data.settings.apiKey} onChangeText={v => update('apiKey', v)} secureTextEntry placeholder="sk-…"/><Field label="API ENDPOINT" value={data.settings.apiUrl} onChangeText={v => update('apiUrl', v)}/><Field label="MODEL" value={data.settings.model} onChangeText={v => update('model', v)}/></View>
    <View style={styles.privacy}><Text style={styles.icon}>⌁</Text><View style={{ flex: 1 }}><Text style={styles.privacyTitle}>Local-first by design</Text><Text style={styles.help}>Vocabulary, generated sentences, indexes, SRS counters, and attempts remain on device. Only AI requests go to DeepSeek.</Text></View></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 15 }}><View style={{ flex: 1 }}><Text style={styles.privacyTitle}>Transfer vocabulary + SRS</Text><Text style={styles.help}>Create one compact QR. Sentences excluded.</Text></View><Button secondary label="Show QR" icon="qr-code-outline" onPress={() => router.push('/qr-export')}/></View>
    <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Word SRS progress</Text><Text style={styles.help}>Sentence and card progress tracked independently</Text></View></View>
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.headerCell, styles.wordCell]}>WORD</Text><Text style={styles.headerCell}>SENTENCES</Text><Text style={styles.headerCell}>CARDS</Text></View>
      {rankedWords.length ? rankedWords.map((word, index) => <View key={word.id} style={[styles.tableRow, index > 0 && styles.tableBorder]}><View style={styles.wordCell}><Text style={styles.hanzi}>{word.hanzi}</Text><Text numberOfLines={1} style={styles.wordMeta}>{word.pinyin} · {word.russian}</Text></View>{stat(word.srsLevel, word.srsCorrect, word.srsIncorrect, word.srsDueAt)}{stat(word.cardSrsLevel, word.cardSrsCorrect, word.cardSrsIncorrect, word.cardSrsDueAt)}</View>) : <Text style={styles.empty}>Import vocabulary to see SRS progress.</Text>}
    </View>
  </ScrollView>;
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; secureTextEntry?: boolean; placeholder?: string }) { return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor="#9A9D95" autoCapitalize="none" autoCorrect={false} style={styles.input}/></View>; }

const styles = StyleSheet.create({ field: { marginBottom: 18 }, label: { fontSize: 11, color: colors.muted, fontWeight: '800', letterSpacing: 1.3, marginBottom: 8 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.paper, paddingHorizontal: 14, height: 50, color: colors.ink, fontSize: 15 }, privacy: { flexDirection: 'row', gap: 13, marginTop: 18, padding: 17, backgroundColor: colors.pale, borderRadius: 15 }, icon: { color: colors.green, fontSize: 24 }, privacyTitle: { color: colors.ink, fontWeight: '800' }, help: { color: colors.muted, marginTop: 5, lineHeight: 20 }, sectionHeading: { marginTop: 30, marginBottom: 11 }, sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: '800' }, table: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden' }, tableRow: { minHeight: 62, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center' }, tableHeader: { minHeight: 38, backgroundColor: colors.pale }, tableBorder: { borderTopWidth: 1, borderTopColor: colors.line }, headerCell: { width: 88, textAlign: 'right', color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: .4 }, wordCell: { flex: 1, minWidth: 0 }, hanzi: { color: colors.ink, fontSize: 20, fontWeight: '800' }, wordMeta: { color: colors.muted, fontSize: 11, marginTop: 2, paddingRight: 8 }, srsCell: { width: 88, alignItems: 'flex-end' }, level: { color: colors.green, fontWeight: '800', fontSize: 12 }, score: { color: colors.muted, fontSize: 11, marginTop: 3 }, empty: { color: colors.muted, textAlign: 'center', padding: 24 } });
