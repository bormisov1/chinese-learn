import { Text } from "@/i18n";
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import jsQR from 'jsqr';
import { BrowserQRCodeReader } from '@zxing/browser';
import { useStore } from '@/context';
import { ImportedWord, recognizeVocabulary } from '@/ocr';
import { decodeQrBackup } from '@/qr-backup';
import { colors } from '@/theme';
import { Button, Header, shell } from '@/ui';
import hskLevels from '@/data/hsk-levels.json';
import type { Dictionary } from '@/dictionary';

async function readQr(uri: string, onStage: (message: string) => void) {
  onStage('Opening QR image…');
  const image = document.createElement('img'); image.src = uri;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not open QR image.')); });
  const zxing = new BrowserQRCodeReader();
  for (const maximum of [2200, 1800, 1200, 800]) {
    onStage(`Scanning QR at ${maximum}px…`);
    await new Promise(resolve => setTimeout(resolve, 20));
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Could not read QR image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height); const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
    if (result) return result.data;
    try { const decoded = zxing.decodeFromCanvas(canvas); if (decoded.getText()) return decoded.getText(); } catch { /* Try another resolution. */ }
  }
  throw new Error(`No readable QR found in ${image.naturalWidth}×${image.naturalHeight} image. Crop tightly around the QR or import a screenshot instead of a camera photo.`);
}

export default function Import() {
  const { data, dictionary, importWords, importWordBackup } = useStore();
  const [images, setImages] = useState<string[]>([]), [detected, setDetected] = useState<ImportedWord[]>([]), [progress, setProgress] = useState(0), [currentImage, setCurrentImage] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [qrBusy, setQrBusy] = useState(false), [qrMessage, setQrMessage] = useState('');
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: 0 }); if (result.canceled) return;
    const uris = result.assets.map(asset => asset.uri); setImages(uris); setDetected([]); setBusy(true); setProgress(0); setCurrentImage(0); setMessage(`Reading ${uris.length} screenshot${uris.length === 1 ? '' : 's'} locally…`);
    try { if (!dictionary) throw new Error('Dictionary is still downloading.'); const combined = new Map<string, ImportedWord>(); for (let i = 0; i < uris.length; i++) { setCurrentImage(i + 1); const words = await recognizeVocabulary(uris[i], dictionary, value => setProgress((i + value) / uris.length)); for (const word of words) combined.set(word.hanzi, word); setDetected([...combined.values()]); setMessage(`Processed ${i + 1} of ${uris.length} · ${combined.size} words detected`); } setMessage(`Processed ${uris.length} image${uris.length === 1 ? '' : 's'}. Review detected words before importing.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'OCR failed'); } finally { setBusy(false); }
  };
  const pickQr = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false }); if (result.canceled) return;
    setQrBusy(true); setQrMessage('Reading QR locally…');
    try { const words = await decodeQrBackup(await readQr(result.assets[0].uri, setQrMessage)); setQrMessage('Restoring vocabulary and SRS…'); importWordBackup(words); setQrMessage(`Restored vocabulary and SRS for ${words.length} words. Sentences were not included.`); }
    catch (e) { setQrMessage(e instanceof Error ? e.message : 'QR import failed.'); } finally { setQrBusy(false); }
  };
  const commit = () => { const count = importWords(detected); setMessage(count ? `Imported ${count} new word${count === 1 ? '' : 's'}. Duplicates skipped.` : 'No new valid words found.'); };

  return <ScrollView style={shell.page} contentContainerStyle={shell.content} keyboardShouldPersistTaps="handled">
    <Header eyebrow="Build your deck" title="Import vocabulary" subtitle="Import screenshots or restore vocabulary and SRS from a QR image."/>
    <View style={styles.qrPanel}><View style={{ flex: 1 }}><Text style={styles.qrTitle}>Vocabulary + SRS QR</Text><Text style={styles.scanText}>Restores words and both SRS histories. Generated sentences excluded.</Text></View><Button secondary label={qrBusy ? 'Reading…' : 'Choose QR image'} icon="qr-code-outline" disabled={qrBusy || busy} onPress={pickQr}/></View>
    {qrMessage ? <Text style={styles.note}>{qrMessage}</Text> : null}
    <HskAdder dictionary={dictionary} existing={new Set(data.words.map(w => w.hanzi))} onAdd={importWords}/>
    <Text style={styles.label}>VOCABULARY SCREENSHOTS</Text>
    <View style={styles.drop}>{images.length ? <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previews}>{images.map((uri, index) => <View key={`${uri}-${index}`}><Image source={{ uri }} style={styles.preview}/><Text style={styles.imageNumber}>{index + 1}</Text></View>)}</ScrollView><Text style={styles.selected}>{images.length} image{images.length === 1 ? '' : 's'} selected</Text></>:<View style={styles.scan}><Text style={styles.scanIcon}>文</Text><Text style={styles.scanTitle}>Vocabulary screenshots</Text><Text style={styles.scanText}>Select multiple images. OCR runs locally in your browser.</Text></View>}<Button label={images.length ? 'Choose other images' : 'Choose screenshots'} icon="images-outline" secondary disabled={busy || qrBusy} onPress={pick}/></View>
    {busy && <View style={styles.progress}><ActivityIndicator color={colors.green}/><Text style={styles.note}>{Math.round(progress * 100)}% · image {currentImage} of {images.length}</Text></View>}
    <View style={styles.review}><Text style={styles.reviewTitle}>{detected.length} detected {detected.length === 1 ? 'word' : 'words'}</Text>{detected.length ? detected.map(w => <View key={w.hanzi} style={styles.row}><Text style={styles.hanzi}>{w.hanzi}</Text><Text style={styles.pinyin}>{w.pinyin}</Text><Text numberOfLines={1} style={styles.russian}>{w.russian}</Text></View>) : <Text style={styles.note}>{busy ? 'Scanning…' : 'Choose screenshots to detect vocabulary.'}</Text>}</View>
    {message ? <Text style={styles.note}>{message}</Text> : null}<Button label={`Import ${detected.length || ''} ${detected.length === 1 ? 'word' : 'words'}`.replace('  ', ' ')} icon="add-circle-outline" disabled={!detected.length || busy} onPress={commit}/>
  </ScrollView>;
}

function HskAdder({ dictionary, existing, onAdd }: { dictionary: Dictionary | null; existing: Set<string>; onAdd: (words: ImportedWord[]) => number }) {
  const [level, setLevel] = useState(1), [message, setMessage] = useState('');
  const cumulative = hskLevels as Record<string, string[]>;
  const lower = new Set(level > 1 ? cumulative[String(level - 1)] : []);
  const available = (cumulative[String(level)] ?? []).filter(hanzi => !lower.has(hanzi) && !!dictionary?.has(hanzi) && !existing.has(hanzi));
  const add = () => { const selected = available.slice(0, 7).map(hanzi => dictionary!.get(hanzi)!); const count = onAdd(selected); setMessage(count ? `Added ${count} new HSK ${level} words.` : `No more HSK ${level} words available.`); };
  return <View style={{ marginTop: 16, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}><Text style={styles.qrTitle}>Add HSK words</Text><Text style={styles.scanText}>Seven new words per click. Choose a level:</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 14 }}>{[1, 2, 3, 4, 5, 6].map(value => <Pressable key={value} onPress={() => { setLevel(value); setMessage(''); }} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: level === value ? colors.green : colors.pale }}><Text style={{ color: level === value ? colors.white : colors.green, fontWeight: '800', fontSize: 12 }}>HSK {value}</Text></Pressable>)}</View><Text style={{ color: colors.muted, fontSize: 12, marginBottom: 12 }}>{available.length} HSK {level} words remaining</Text><Button label={`Add 7 HSK ${level} words`} icon="add-circle-outline" disabled={!available.length} onPress={add}/>{message ? <Text style={styles.note}>{message}</Text> : null}</View>;
}

const styles = StyleSheet.create({ qrPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 4, backgroundColor: colors.pale, borderRadius: 16 }, qrTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 }, drop: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#BDC9C0', borderRadius: 18, padding: 14, gap: 13, backgroundColor: colors.card }, scan: { alignItems: 'center', padding: 18 }, scanIcon: { fontSize: 34, color: colors.green, backgroundColor: colors.pale, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, overflow: 'hidden' }, scanTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 10 }, scanText: { color: colors.muted, marginTop: 4, textAlign: 'center' }, previews: { gap: 10 }, preview: { width: 130, height: 160, borderRadius: 12, resizeMode: 'cover', backgroundColor: '#EEECE5' }, imageNumber: { position: 'absolute', top: 7, right: 7, color: colors.white, backgroundColor: colors.green, width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontWeight: '800' }, selected: { color: colors.muted, textAlign: 'center', fontSize: 12 }, label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 23, marginBottom: 9 }, review: { marginVertical: 14, backgroundColor: colors.card, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 14 }, reviewTitle: { fontWeight: '800', color: colors.ink, marginBottom: 8 }, row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 }, hanzi: { fontSize: 20, fontWeight: '700', width: 70 }, pinyin: { color: colors.green, width: 120 }, russian: { color: colors.muted, flex: 1 }, note: { color: colors.muted, marginVertical: 10, lineHeight: 20 }, progress: { flexDirection: 'row', gap: 10, alignItems: 'center' } });
