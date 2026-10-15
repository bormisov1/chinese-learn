import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useStore } from '@/context';
import { Text, useTranslation } from '@/i18n';
import { containedBox, coveredBox, groupOcrCharacters, recognizedWord } from '@/photo-ocr-layout';
import { recognizePhoto, type PhotoOcrResult } from '@/photo-ocr';
import { colors } from '@/theme';
import { Button, Header, shell } from '@/ui';
import { removeVocabularyWord } from '@/vocabulary-selection';

type Frame = { uri: string; result: PhotoOcrResult };
type ViewSize = { width: number; height: number };

async function discardCameraPhoto(uri: string) {
  if (Platform.OS === 'web' || !uri.startsWith('file://')) return;
  try {
    const { File } = await import('expo-file-system');
    new File(uri).delete();
  } catch {
    // Camera cache files can already be removed by the operating system.
  }
}

export default function Recognition() {
  const { data, dictionary, dictionaryLoading, dictionaryError, retryDictionary, importWords, patch } = useStore();
  const t = useTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;
  const camera = useRef<CameraView>(null);
  const currentCameraPhoto = useRef<string | null>(null);
  const scanGeneration = useRef(0);
  const scanTask = useRef<Promise<void> | null>(null);
  const freezeGeneration = useRef(0);
  const permissionRequested = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [mode, setMode] = useState<'camera' | 'photo'>('camera');
  const [paused, setPaused] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [viewSize, setViewSize] = useState<ViewSize>({ width: 0, height: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [capturingFreeze, setCapturingFreeze] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => {
      scanGeneration.current++;
      freezeGeneration.current++;
      setFocused(false);
      setCameraReady(false);
      setCapturingFreeze(false);
      setBusy(false);
      setPaused(false);
      setFrame(null);
      setSelected(new Set());
      setPendingRemoval(null);
    };
  }, []));

  useEffect(() => () => {
    if (currentCameraPhoto.current) void discardCameraPhoto(currentCameraPhoto.current);
  }, []);

  useEffect(() => {
    if (!focused || !permission || permission.granted || !permission.canAskAgain || permissionRequested.current) return;
    permissionRequested.current = true;
    void requestPermission();
  }, [focused, permission, requestPermission]);

  useEffect(() => {
    if (!focused || mode !== 'camera' || paused || !permission?.granted || !cameraReady) return;
    const generation = ++scanGeneration.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const task = scan();
        scanTask.current = task;
        void task.finally(() => { if (scanTask.current === task) scanTask.current = null; });
      }, delay);
    };
    const scan = async () => {
      if (!camera.current || stopped || generation !== scanGeneration.current) return;
      setScanning(true);
      let capturedUri: string | null = null;
      try {
        // OCR runs on occasional captures; the camera preview keeps drawing live frames.
        const photo = await camera.current.takePictureAsync({ quality: 0.6, shutterSound: false });
        if (!photo) return;
        capturedUri = photo.uri;
        if (stopped || generation !== scanGeneration.current) return;
        const result = await recognizePhoto(photo.uri);
        if (!stopped && generation === scanGeneration.current) {
          const previous = currentCameraPhoto.current;
          currentCameraPhoto.current = photo.uri;
          setFrame({ uri: photo.uri, result });
          setMessage('');
          capturedUri = null;
          if (previous) setTimeout(() => { void discardCameraPhoto(previous); }, 1000);
        }
      } catch (error) {
        if (!stopped && generation === scanGeneration.current) setMessage(error instanceof Error ? error.message : translateRef.current('Could not recognize this photo.'));
      } finally {
        if (capturedUri) void discardCameraPhoto(capturedUri);
        if (!stopped && generation === scanGeneration.current) {
          setScanning(false);
          schedule(700);
        }
      }
    };
    schedule(0);
    return () => { stopped = true; scanGeneration.current++; clearTimeout(timer); setScanning(false); };
  }, [cameraReady, focused, mode, paused, permission?.granted]);

  const freeze = async () => {
    if (!camera.current || !cameraReady || busy || capturingFreeze) return;
    const generation = ++freezeGeneration.current;
    scanGeneration.current++;
    setPaused(true);
    setCapturingFreeze(true);
    setFrame(null);
    setSelected(new Set());
    setPendingRemoval(null);
    setMessage('');
    let capturedUri: string | null = null;
    try {
      // Let an in-flight scan finish before taking the frame that will be shown.
      await scanTask.current;
      if (generation !== freezeGeneration.current || !camera.current) return;
      const photo = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!photo) throw new Error(translateRef.current('Could not recognize this photo.'));
      capturedUri = photo.uri;
      if (generation !== freezeGeneration.current) return;
      setCapturingFreeze(false);
      const previous = currentCameraPhoto.current;
      currentCameraPhoto.current = photo.uri;
      setFrame({ uri: photo.uri, result: { width: photo.width, height: photo.height, words: [] } });
      capturedUri = null;
      if (previous) setTimeout(() => { void discardCameraPhoto(previous); }, 1000);
      setBusy(true);
      const result = await recognizePhoto(photo.uri);
      if (generation === freezeGeneration.current) {
        setFrame({ uri: photo.uri, result });
        if (!result.words.length) setMessage(translateRef.current('No text was found. Try another photo.'));
      }
    } catch (error) {
      if (generation === freezeGeneration.current) setMessage(error instanceof Error ? error.message : translateRef.current('Could not recognize this photo.'));
    } finally {
      if (capturedUri) void discardCameraPhoto(capturedUri);
      if (generation === freezeGeneration.current) {
        setCapturingFreeze(false);
        setBusy(false);
      }
    }
  };

  const resume = () => {
    freezeGeneration.current++;
    setPaused(false);
    setFrame(null);
    setSelected(new Set());
    setPendingRemoval(null);
    setMessage('');
  };

  const choosePhoto = async () => {
    if (busy) return;
    freezeGeneration.current++;
    scanGeneration.current++;
    const wasPaused = paused;
    setPaused(true);
    setBusy(true);
    setMessage('');
    try {
      const chosen = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (chosen.canceled || !chosen.assets?.[0]) {
        setPaused(wasPaused);
        return;
      }
      const photo = chosen.assets[0];
      setMode('photo');
      setSelected(new Set());
      setPendingRemoval(null);
      const previous = currentCameraPhoto.current;
      currentCameraPhoto.current = null;
      setFrame({ uri: photo.uri, result: { width: photo.width || 1, height: photo.height || 1, words: [] } });
      if (previous) setTimeout(() => { void discardCameraPhoto(previous); }, 1000);
      const result = await recognizePhoto(photo.uri);
      setFrame({ uri: photo.uri, result });
      if (!result.words.length) setMessage(t('No text was found. Try another photo.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Could not recognize this photo.'));
    } finally {
      setBusy(false);
    }
  };

  const showCamera = () => {
    freezeGeneration.current++;
    setFrame(null);
    setMode('camera');
    setPaused(false);
    setCameraReady(false);
    setSelected(new Set());
    setPendingRemoval(null);
    setMessage('');
  };

  const savedWords = useMemo(() => new Map(data.words.map(word => [word.hanzi, word])), [data.words]);
  const existing = useMemo(() => new Set(savedWords.keys()), [savedWords]);
  const selectedWords = [...selected].flatMap(hanzi => {
    const word = dictionary?.get(hanzi);
    return word && !existing.has(hanzi) ? [word] : [];
  });
  const groupedWords = useMemo(() => groupOcrCharacters(frame?.result.words ?? [], dictionary), [frame, dictionary]);
  const recognizedExpressions = useMemo(() => [...new Set(groupedWords.flatMap(item => {
    const hanzi = recognizedWord(item.text);
    return hanzi ? [hanzi] : [];
  }))], [groupedWords]);
  // Keep selected expressions visible if a later live scan misses them.
  const visibleExpressions = [...new Set([...recognizedExpressions, ...selected, ...(pendingRemoval ? [pendingRemoval] : [])])];
  const highlights = groupedWords.flatMap((item, index) => {
    const hanzi = recognizedWord(item.text);
    if (!frame) return [];
    const box = mode === 'camera'
      ? coveredBox(item.box, frame.result.width, frame.result.height, viewSize.width, viewSize.height)
      : containedBox(item.box, frame.result.width, frame.result.height, viewSize.width, viewSize.height);
    return hanzi && box ? [{ id: index, hanzi, box, entry: dictionary?.get(hanzi) }] : [];
  });

  const toggle = (hanzi: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(hanzi)) next.delete(hanzi);
      else next.add(hanzi);
      return next;
    });
    setMessage('');
  };

  const addSelected = () => {
    const count = importWords(selectedWords);
    setSelected(new Set());
    setMessage(count ? t('Added') + ' ' + count + ' ' + t('words to your deck.') : t('No new words to add.'));
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    patch(current => removeVocabularyWord(current, pendingRemoval));
    setPendingRemoval(null);
    setMessage('');
  };

  return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
    <Header eyebrow="CAMERA" title="Recognition" subtitle="Point at text, then choose expressions below the camera." />
    <View style={styles.actions}>
      <View style={styles.action}>
        {mode === 'camera'
          ? <Button label={paused ? 'Resume' : 'Freeze'} icon={paused ? 'play-outline' : 'pause-outline'} disabled={!cameraReady || !permission?.granted || capturingFreeze || busy} onPress={paused ? resume : () => void freeze()} />
          : <Button label="Use camera" icon="camera-outline" onPress={showCamera} />}
      </View>
      <View style={styles.action}><Button label="Choose photo" icon="images-outline" secondary disabled={busy} onPress={() => void choosePhoto()} /></View>
    </View>

    <View style={styles.cameraShell} onLayout={event => setViewSize(event.nativeEvent.layout)}>
      {focused && mode === 'camera' && permission?.granted
        ? <CameraView ref={camera} style={StyleSheet.absoluteFillObject} facing="back" active={focused && (!paused || capturingFreeze)} onCameraReady={() => setCameraReady(true)} />
        : null}
      {frame && (paused || mode === 'photo') ? <Image source={{ uri: frame.uri }} style={StyleSheet.absoluteFillObject} resizeMode={mode === 'camera' ? 'cover' : 'contain'} accessibilityLabel="Recognized camera frame" /> : null}
      {highlights.map(({ id, hanzi, box, entry }) =>
        <View
          key={id}
          pointerEvents="none"
          style={[styles.highlight, { left: box.x, top: box.y, width: box.width, height: box.height }, selected.has(hanzi) && styles.highlightSelected, !entry && !existing.has(hanzi) && styles.highlightUnavailable]}
        />,
      )}
      {mode === 'camera' && !permission?.granted
        ? <View style={styles.cameraMessage}>
          <Ionicons name="camera-outline" size={36} color={colors.white} />
          <Text style={styles.cameraMessageText}>{permission?.canAskAgain === false ? 'Enable camera access in device settings.' : 'Camera access is needed to recognize text.'}</Text>
          {permission?.canAskAgain ? <Button label="Enable camera" secondary onPress={() => void requestPermission()} /> : null}
        </View>
        : null}
      {!frame && mode === 'camera' && permission?.granted ? <View pointerEvents="none" style={styles.hintBadge}><Text style={styles.scanBadgeText}>Point the camera at Chinese text.</Text></View> : null}
      {(scanning || busy) && permission?.granted ? <View style={styles.scanBadge}><ActivityIndicator size="small" color={colors.white} /><Text style={styles.scanBadgeText}>Recognizing text…</Text></View> : null}
      {paused && mode === 'camera' ? <View style={styles.freezeBadge}><Ionicons name="pause" size={13} color={colors.white} /><Text style={styles.scanBadgeText}>Frozen</Text></View> : null}
    </View>

    {message ? <Text style={styles.message}>{message}</Text> : null}
    {dictionaryLoading ? <Text style={styles.help}>Loading dictionary…</Text> : null}
    {dictionaryError && !dictionary ? <View style={styles.error}><Text style={styles.message}>{dictionaryError}</Text><Button label="Retry dictionary" secondary onPress={retryDictionary} /></View> : null}
    <View style={styles.panel}>
      <Text style={styles.heading}>{visibleExpressions.length ? t('Recognized expressions') : t('Move closer to readable Chinese text.')}</Text>
      <Text style={styles.help}>{t('Tap an expression to select it, or a saved word to remove it.')}</Text>
      {visibleExpressions.length ? <View style={styles.expressionList}>{visibleExpressions.map(hanzi => {
        const saved = savedWords.get(hanzi);
        const entry = dictionary?.get(hanzi);
        const added = Boolean(saved);
        const checked = selected.has(hanzi);
        const available = Boolean(entry) || added;
        const status = added ? t('In your deck') : checked ? t('Selected') : available ? t('Select') : t('Not in dictionary');
        return <Fragment key={hanzi}><Pressable
          accessibilityRole="button"
          accessibilityLabel={`${hanzi}, ${status}, ${entry?.pinyin ?? saved?.pinyin ?? ''}, ${entry?.russian ?? saved?.russian ?? ''}`}
          accessibilityState={{ selected: checked, disabled: !available || busy }}
          disabled={!available || busy}
          onPress={() => added ? setPendingRemoval(hanzi) : toggle(hanzi)}
          style={[styles.expressionRow, checked && styles.expressionSelected, added && styles.expressionAdded, !available && styles.expressionUnavailable]}
        >
          <Text style={styles.expressionHanzi}>{hanzi}</Text>
          <View style={styles.expressionDetails}>
            <Text style={styles.expressionPinyin} numberOfLines={1}>{entry?.pinyin ?? saved?.pinyin}</Text>
            <Text style={styles.expressionMeaning} numberOfLines={2}>{entry?.russian ?? saved?.russian ?? t('Not in dictionary')}</Text>
          </View>
          <View style={styles.expressionStatus}>
            <Ionicons name={added ? 'trash-outline' : checked ? 'checkmark-circle' : available ? 'add-circle-outline' : 'remove-circle-outline'} size={21} color={added ? colors.red : available ? colors.green : colors.muted} />
            <Text style={[styles.expressionStatusText, added && styles.expressionRemoveText]}>{status}</Text>
          </View>
        </Pressable>
        {pendingRemoval === hanzi ? <View style={styles.confirmRemoval}>
          <Text style={styles.heading}>{t('Remove')} {hanzi}?</Text>
          <Text style={styles.help}>{t('Do you really want to remove this word from your vocabulary?')}</Text>
          <View style={styles.confirmActions}>
            <Button label="Cancel" secondary onPress={() => setPendingRemoval(null)} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('Remove')} ${hanzi}`} onPress={confirmRemoval} style={styles.removeButton}><Text style={styles.removeButtonText}>{t('Remove')}</Text></Pressable>
          </View>
        </View> : null}</Fragment>;
      })}</View> : null}
      <Button label={t('Add selected') + ' (' + selectedWords.length + ')'} icon="add-circle-outline" disabled={!selectedWords.length || busy} onPress={addSelected} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  action: { flex: 1 },
  cameraShell: { width: '100%', height: 390, overflow: 'hidden', borderRadius: 18, backgroundColor: '#19231E' },
  cameraMessage: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14, backgroundColor: '#19231E' },
  cameraMessageText: { color: colors.white, textAlign: 'center', fontSize: 16, lineHeight: 23 },
  hintBadge: { position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center', backgroundColor: 'rgba(20, 32, 25, 0.75)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  highlight: { position: 'absolute', borderColor: '#F7D56B', borderWidth: 2, borderRadius: 5, backgroundColor: 'rgba(247, 213, 107, 0.19)' },
  highlightSelected: { borderColor: '#70E3A1', backgroundColor: 'rgba(55, 140, 92, 0.48)' },
  highlightUnavailable: { borderColor: '#FFFFFF', backgroundColor: 'rgba(50, 50, 50, 0.26)', opacity: 0.62 },
  scanBadge: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: 'rgba(20, 32, 25, 0.75)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  freezeBadge: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(20, 32, 25, 0.75)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7 },
  scanBadgeText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  panel: { backgroundColor: colors.card, borderRadius: 16, borderColor: colors.line, borderWidth: 1, padding: 16, marginTop: 14, gap: 12 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  help: { color: colors.muted, lineHeight: 20 },
  message: { color: colors.green, marginTop: 12, lineHeight: 20 },
  error: { alignItems: 'flex-start', gap: 8 },
  expressionList: { gap: 8 },
  expressionRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  expressionSelected: { borderColor: colors.green, backgroundColor: colors.pale },
  expressionAdded: { backgroundColor: colors.pale },
  expressionUnavailable: { opacity: 0.6 },
  expressionHanzi: { color: colors.ink, fontSize: 21, fontWeight: '800', minWidth: 38 },
  expressionDetails: { flex: 1, minWidth: 0, gap: 2 },
  expressionPinyin: { color: colors.green, fontSize: 13 },
  expressionMeaning: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  expressionStatus: { alignItems: 'center', width: 72, gap: 2 },
  expressionStatusText: { color: colors.green, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  expressionRemoveText: { color: colors.red },
  confirmRemoval: { gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.red },
  removeButtonText: { color: colors.white, fontWeight: '800' },
});
