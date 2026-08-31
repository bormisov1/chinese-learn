import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'qrcode';
import { deflate } from 'pako';
import { useStore } from '@/context';
import dictionaryRows from '@/data/hsk-russian.json';
import { colors } from '@/theme';
import { Header, shell } from '@/ui';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function base45(bytes: Uint8Array) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) { const value = bytes[i] * 256 + bytes[i + 1]; result += alphabet[value % 45] + alphabet[Math.floor(value / 45) % 45] + alphabet[Math.floor(value / 2025)]; }
    else { result += alphabet[bytes[i] % 45] + alphabet[Math.floor(bytes[i] / 45)]; }
  }
  return result;
}

const compress = (value: string) => deflate(new TextEncoder().encode(value));

export default function QrExport() {
  const { data, ready } = useStore();
  const [image, setImage] = useState(''), [details, setDetails] = useState(''), [error, setError] = useState('');
  const dictionary = useMemo(() => new Map((dictionaryRows as [string, string, string][]).map((row, index) => [row[0], index])), []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const words = data.words.map(w => {
          const dictionaryId = dictionary.get(w.hanzi);
          const identity: unknown[] = dictionaryId === undefined ? [-1, w.hanzi, w.pinyin, w.russian] : [dictionaryId];
          return [...identity, w.exampleCount, w.wordShownCount, w.createdAt, w.srsLevel, w.srsCorrect, w.srsIncorrect, w.srsDueAt, w.cardSrsLevel, w.cardSrsCorrect, w.cardSrsIncorrect, w.cardSrsDueAt, w.cardIntroducedAt ?? 0, w.cardActive ? 1 : 0, w.cardLastStudiedRound ?? -1];
        });
        const json = JSON.stringify(['HD1', 'hsk-russian-v1', words]);
        const packed = compress(json), payload = `HD1:${base45(packed)}`;
        let level: 'Q' | 'M' = 'Q';
        let qr;
        try { qr = QRCode.create(payload, { errorCorrectionLevel: level }); }
        catch { level = 'M'; qr = QRCode.create(payload, { errorCorrectionLevel: level }); }
        const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: level, margin: 4 });
        setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        setDetails(`${data.words.length} words · no sentences · ${json.length} JSON bytes → ${packed.length} compressed bytes → ${payload.length} QR characters · version ${qr.version} · ECC ${level}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not create QR.'); }
    })();
  }, [ready, data.words, dictionary]);

  return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
    <Header eyebrow="Local transfer experiment" title="Vocabulary + SRS QR" subtitle="Generated from this browser’s current data. Sentences and attempts excluded."/>
    <View style={styles.panel}>{image ? <Image source={{ uri: image }} style={styles.qr}/>: <Text style={styles.waiting}>{error || 'Compressing and generating QR…'}</Text>}</View>
    <Text style={styles.details}>{details}</Text>
    <Text style={styles.note}>Contains vocabulary identity, example/shown counters, creation time, active-pool state, and separate sentence/card SRS levels, correct/incorrect counters, and due dates. Known vocabulary uses bundled dictionary indexes; unknown words embed Hanzi, pinyin, and Russian. For easiest import, take a screenshot of this QR rather than photographing the screen.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ panel: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, alignItems: 'center' }, qr: { width: '100%', maxWidth: 700, aspectRatio: 1, resizeMode: 'contain' }, waiting: { color: colors.muted, padding: 50, textAlign: 'center' }, details: { color: colors.green, fontWeight: '800', marginTop: 16, lineHeight: 21 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 } });
