import { Text } from "@/i18n";
import { useState } from 'react';
import { ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useStore } from '@/context';
import type { ImportedWord } from '@/types';
import { colors } from '@/theme';
import { Button, Header, shell } from '@/ui';
import hskLevels from '@/data/hsk-levels.json';
import type { Dictionary } from '@/dictionary';
import { parseTextVocabulary } from '@/text-vocabulary';

export default function Import() {
  const { data, dictionary, dictionaryLoading, dictionaryError, retryDictionary, importWords } = useStore();
  const [text, setText] = useState(''), [textMessage, setTextMessage] = useState('');
  const parsedText = parseTextVocabulary(text, dictionary);
  const commitText = () => {
    const count = importWords(parsedText.words);
    setTextMessage(count ? `Added ${count} new word${count === 1 ? '' : 's'}. Duplicates skipped.` : 'No new words to add.');
  };

  return <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
    <Header eyebrow="Build your deck" title="Import vocabulary" subtitle="Enter Chinese text or add words from an HSK level."/>
    {dictionaryLoading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><ActivityIndicator color={colors.green}/><Text style={styles.note}>Loading dictionary…</Text></View> : null}
    {dictionaryError && !dictionary ? <View style={{ alignItems: 'flex-start', marginBottom: 14 }}><Text style={styles.warning}>{dictionaryError} Saved cards are unaffected.</Text><Button secondary label="Retry dictionary" onPress={retryDictionary}/></View> : null}
    <HskAdder dictionary={dictionary} existing={new Set(data.words.map(w => w.hanzi))} onAdd={importWords}/>
    <Text style={styles.label}>CHINESE TEXT</Text>
    <View style={styles.textPanel}>
      <Text style={styles.qrTitle}>Add a word or sentence</Text>
      <Text style={styles.textHelp}>Enter Chinese text and each dictionary word will be added to your vocabulary.</Text>
      <TextInput
        accessibilityLabel="Chinese word or sentence"
        multiline
        onChangeText={value => { setText(value); setTextMessage(''); }}
        placeholder="例如：我喜欢学习中文"
        placeholderTextColor={colors.muted}
        style={styles.textInput}
        value={text}
      />
      {parsedText.words.length ? <View style={styles.textPreview}>{parsedText.words.map(word => <View key={word.hanzi} style={styles.row}><Text style={styles.hanzi}>{word.hanzi}</Text><Text style={styles.pinyin}>{word.pinyin}</Text><Text numberOfLines={1} style={styles.russian}>{word.russian}</Text></View>)}</View> : <Text style={styles.note}>{text.trim() ? 'No dictionary words found.' : 'Recognized words will appear here.'}</Text>}
      {parsedText.unmatchedCharacters > 0 ? <Text style={styles.warning}>{parsedText.unmatchedCharacters} Chinese character{parsedText.unmatchedCharacters === 1 ? '' : 's'} could not be matched and will be skipped.</Text> : null}
      <Button label={`Add ${parsedText.words.length || ''} ${parsedText.words.length === 1 ? 'word' : 'words'}`.replace('  ', ' ')} icon="add-circle-outline" disabled={!parsedText.words.length} onPress={commitText}/>
      {textMessage ? <Text style={styles.note}>{textMessage}</Text> : null}
    </View>
  </ScrollView>;
}

function HskAdder({ dictionary, existing, onAdd }: { dictionary: Dictionary | null; existing: Set<string>; onAdd: (words: ImportedWord[]) => number }) {
  const [level, setLevel] = useState(1), [message, setMessage] = useState('');
  const cumulative = hskLevels as Record<string, string[]>;
  const lower = new Set(level > 1 ? cumulative[String(level - 1)] : []);
  const available = (cumulative[String(level)] ?? []).filter(hanzi => !lower.has(hanzi) && !!dictionary?.has(hanzi) && !existing.has(hanzi));
  const add = () => { const selected = available.slice(0, 7).map(hanzi => dictionary!.get(hanzi)!); const count = onAdd(selected); setMessage(count ? `Added ${count} new HSK ${level} words.` : `No more HSK ${level} words available.`); };
  return <View style={{ marginTop: 16, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><Text style={styles.qrTitle}>Add HSK words</Text><Text style={styles.textHelp}>Seven new words per click. Choose a level:</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 14 }}>{[1, 2, 3, 4, 5, 6].map(value => <Pressable key={value} onPress={() => { setLevel(value); setMessage(''); }} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: level === value ? colors.green : colors.pale }}><Text style={{ color: level === value ? colors.white : colors.green, fontWeight: '800', fontSize: 12 }}>HSK {value}</Text></Pressable>)}</View><Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>{available.length} HSK {level} words remaining</Text><Button label={`Add 7 HSK ${level} words`} icon="add-circle-outline" disabled={!available.length} onPress={add}/>{message ? <Text style={styles.note}>{message}</Text> : null}</View>;
}

const styles = StyleSheet.create({ qrTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 }, textPanel: { padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }, textHelp: { color: colors.muted, marginTop: 4, lineHeight: 20 }, textInput: { minHeight: 92, marginTop: 14, padding: 13, borderWidth: 1, borderColor: '#BDC9C0', borderRadius: 12, backgroundColor: colors.paper, color: colors.ink, fontSize: 17, lineHeight: 25, textAlignVertical: 'top' }, textPreview: { marginVertical: 10 }, warning: { color: colors.coral, fontSize: 12, lineHeight: 18, marginBottom: 12 }, label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 23, marginBottom: 9 }, row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 }, hanzi: { fontSize: 20, fontWeight: '700', width: 70 }, pinyin: { color: colors.green, width: 120 }, russian: { color: colors.muted, flex: 1 }, note: { color: colors.muted, marginVertical: 10, lineHeight: 20 } });
