import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useStore } from '@/context';
import { Text, useTranslation } from '@/i18n';
import { recognizePhoto } from '@/photo-ocr';
import { colors } from '@/theme';
import { parseTextVocabulary } from '@/text-vocabulary';
import { Button, Header, shell } from '@/ui';

export default function Recognition() {
  const { data, dictionary, dictionaryLoading, dictionaryError, retryDictionary, importWords } = useStore();
  const t = useTranslation();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState('');
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const startedRef = useRef(false);

  const capture = useCallback(async (source: 'camera' | 'library') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setMessage(t('Camera access is needed to recognize text.'));
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      setImageUri(uri);
      setRecognizedText('');
      setSelection(null);
      const text = await recognizePhoto(uri);
      setRecognizedText(text.trim());
      if (!text.trim()) setMessage(t('No text was found. Try another photo.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Could not recognize this photo.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (Platform.OS === 'web' || startedRef.current) return;
    startedRef.current = true;
    void capture('camera');
  }, [capture]);

  // OCR often inserts spaces between individual Hanzi. Keep line breaks as word boundaries.
  const parsed = useMemo(() => parseTextVocabulary(recognizedText.replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, ''), dictionary), [recognizedText, dictionary]);
  const existing = useMemo(() => new Set(data.words.map(word => word.hanzi)), [data.words]);
  const available = parsed.words.filter(word => !existing.has(word.hanzi));
  const selected = selection ?? new Set(available.map(word => word.hanzi));
  const selectedWords = available.filter(word => selected.has(word.hanzi));

  const toggle = (hanzi: string) => {
    const next = new Set(selected);
    if (next.has(hanzi)) next.delete(hanzi);
    else next.add(hanzi);
    setSelection(next);
    setMessage('');
  };
  const addSelected = () => {
    const count = importWords(selectedWords);
    setSelection(new Set());
    setMessage(count ? `${t('Added')} ${count} ${t('words to your deck.')}` : t('No new words to add.'));
  };

  return <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
    <Header eyebrow="CAMERA" title="Recognition" subtitle="Photograph a sign or label, then choose words to add." />
    <View style={styles.actions}>
      <View style={styles.action}><Button label="Take photo" icon="camera-outline" disabled={busy} onPress={() => void capture('camera')} /></View>
      <View style={styles.action}><Button label="Choose photo" icon="images-outline" secondary disabled={busy} onPress={() => void capture('library')} /></View>
    </View>
    {busy ? <View style={styles.progress}><ActivityIndicator color={colors.green} /><Text style={styles.help}>Recognizing text…</Text></View> : null}
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Photo being recognized" /> : null}
    {dictionaryLoading ? <Text style={styles.help}>Loading dictionary…</Text> : null}
    {dictionaryError && !dictionary ? <View style={styles.error}><Text style={styles.message}>{dictionaryError}</Text><Button label="Retry dictionary" secondary onPress={retryDictionary} /></View> : null}
    {recognizedText ? <View style={styles.panel}>
      <Text style={styles.heading}>Recognized text</Text>
      <Text style={styles.help}>Correct any mistakes before choosing words.</Text>
      <TextInput
        accessibilityLabel="Recognized Chinese text"
        multiline
        onChangeText={value => { setRecognizedText(value); setSelection(null); setMessage(''); }}
        style={styles.textInput}
        value={recognizedText}
      />
      <Text style={[styles.heading, styles.wordsHeading]}>Choose words to add</Text>
      {parsed.words.length ? parsed.words.map(word => {
        const alreadyAdded = existing.has(word.hanzi);
        const checked = !alreadyAdded && selected.has(word.hanzi);
        return <Pressable
          key={word.hanzi}
          accessibilityRole="checkbox"
          accessibilityLabel={`${word.hanzi}, ${word.pinyin}, ${word.russian}`}
          accessibilityState={{ checked, disabled: alreadyAdded }}
          disabled={alreadyAdded}
          onPress={() => toggle(word.hanzi)}
          style={[styles.wordRow, alreadyAdded && styles.addedRow]}
        >
          <Ionicons name={alreadyAdded ? 'checkmark-circle' : checked ? 'checkbox' : 'square-outline'} size={24} color={alreadyAdded ? colors.muted : colors.green} />
          <View style={styles.wordText}><Text style={styles.hanzi}>{word.hanzi}</Text><Text style={styles.pinyin}>{word.pinyin}</Text><Text style={styles.meaning} numberOfLines={2}>{word.russian}</Text></View>
          {alreadyAdded ? <Text style={styles.alreadyAdded}>Added</Text> : null}
        </Pressable>;
      }) : <Text style={styles.help}>No dictionary words found in this photo.</Text>}
      {parsed.unmatchedCharacters > 0 ? <Text style={styles.help}>{`${t('Unmatched Chinese characters will be skipped:')} ${parsed.unmatchedCharacters}`}</Text> : null}
      <Button label={`${t('Add selected')} (${selectedWords.length})`} icon="add-circle-outline" disabled={!selectedWords.length} onPress={addSelected} />
    </View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  preview: { width: '100%', height: 230, backgroundColor: colors.card, borderRadius: 16, marginTop: 16 },
  panel: { backgroundColor: colors.card, borderRadius: 16, borderColor: colors.line, borderWidth: 1, padding: 16, marginTop: 16, gap: 10 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  wordsHeading: { marginTop: 10 },
  help: { color: colors.muted, lineHeight: 20 },
  message: { color: colors.green, marginVertical: 12, lineHeight: 20 },
  error: { alignItems: 'flex-start', gap: 8 },
  textInput: { minHeight: 90, color: colors.ink, backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top', fontSize: 16 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 11 },
  addedRow: { opacity: 0.55 },
  wordText: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  hanzi: { color: colors.ink, fontWeight: '800', fontSize: 20 },
  pinyin: { color: colors.green, fontSize: 13 },
  meaning: { color: colors.muted, fontSize: 13, flexBasis: '100%' },
  alreadyAdded: { color: colors.muted, fontSize: 12 },
});
