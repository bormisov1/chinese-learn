import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder, Pressable, ScrollView, StyleSheet, View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Text } from '@/i18n';
import { colors } from '@/theme';
import { prepareRecognition, recognizeStrokes } from '@/handwriting/recognition';
import type { Point, Stroke } from '@/handwriting/types';

export default function Handwriting() {
  const [output, setOutput] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke>([]);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const sizeRef = useRef(size);
  const activeRef = useRef<Stroke>([]);

  function point(event: GestureResponderEvent): Point {
    const { locationX, locationY } = event.nativeEvent;
    return [
      Math.max(0, Math.min(sizeRef.current.width, locationX)),
      Math.max(0, Math.min(sizeRef.current.height, locationY)),
      Date.now(),
    ];
  }

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      activeRef.current = [point(event)];
      setActive(activeRef.current);
    },
    onPanResponderMove: event => {
      const next = point(event);
      const last = activeRef.current.at(-1);
      if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
      activeRef.current = [...activeRef.current, next];
      setActive(activeRef.current);
    },
    onPanResponderRelease: event => {
      const stroke = [...activeRef.current, point(event)];
      if (stroke.length >= 2) setStrokes(current => [...current, stroke]);
      activeRef.current = [];
      setActive([]);
    },
    onPanResponderTerminate: () => {
      activeRef.current = [];
      setActive([]);
    },
  }), []);

  function loadModel() {
    setError('');
    setReady(false);
    prepareRecognition()
      .then(() => setReady(true))
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }

  useEffect(() => { loadModel(); }, []);

  useEffect(() => {
    setCandidates([]);
    setSelected(0);
    if (!strokes.length || !ready || size.width <= 1 || size.height <= 1) {
      setRecognizing(false);
      return;
    }
    let cancelled = false;
    setRecognizing(true);
    const timer = setTimeout(() => {
      recognizeStrokes(strokes, size.width, size.height)
        .then(matches => { if (!cancelled) setCandidates(matches); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { if (!cancelled) setRecognizing(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [strokes, size.width, size.height, ready]);

  function clearDrawing() {
    activeRef.current = [];
    setActive([]);
    setStrokes([]);
    setCandidates([]);
    setSelected(0);
  }

  function insertCandidate() {
    const character = candidates[selected];
    if (!character) return;
    setOutput(current => current + character);
    clearDrawing();
  }

  async function copyOutput() {
    if (!output) return;
    await Clipboard.setStringAsync(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const visible = active.length ? [...strokes, active] : strokes;
  return <View style={styles.page}>
    <View style={styles.outputPanel}>
      <Text
        accessibilityLabel="Handwriting output"
        selectable
        numberOfLines={1}
        style={[styles.outputText, !output && styles.outputPlaceholder]}
      >{output || 'Your text appears here'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Copy output" disabled={!output} onPress={copyOutput} style={[styles.copyButton, !output && styles.disabled]}>
        <Ionicons name={copied ? 'checkmark-outline' : 'copy-outline'} size={18} color={colors.green} />
        <Text style={styles.copyLabel}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>

    <View style={styles.drawingFrame}>
      <View
        style={styles.canvas}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          sizeRef.current = { width, height };
          setSize(current => current.width === width && current.height === height ? current : { width, height });
        }}
        {...pan.panHandlers}
      >
        <Svg width="100%" height="100%" pointerEvents="none">
          {visible.map((stroke, index) => stroke.length > 1
            ? <Polyline key={index} points={stroke.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={colors.ink} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            : <Circle key={index} cx={stroke[0][0]} cy={stroke[0][1]} r={4} fill={colors.ink} />)}
        </Svg>
        {!visible.length && <View pointerEvents="none" style={styles.placeholder}><Text style={styles.placeholderText}>Draw one Hanzi here</Text></View>}
      </View>
      <View style={styles.drawingActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo last stroke" disabled={!strokes.length} onPress={() => setStrokes(current => current.slice(0, -1))} style={[styles.roundButton, !strokes.length && styles.disabled]}>
          <Ionicons name="arrow-undo-outline" size={22} color={colors.green} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear drawing" disabled={!strokes.length} onPress={clearDrawing} style={[styles.roundButton, !strokes.length && styles.disabled]}>
          <Ionicons name="trash-outline" size={21} color={colors.green} />
        </Pressable>
      </View>
    </View>

    <View style={styles.bottomPanel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.candidateContent} style={styles.candidateScroll}>
        {candidates.length ? candidates.map((candidate, index) =>
          <Pressable key={`${candidate}-${index}`} accessibilityRole="button" accessibilityLabel={`Candidate ${index + 1}: ${candidate}`} accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} style={[styles.candidate, selected === index && styles.candidateSelected]}>
            <Text style={styles.hanzi}>{candidate}</Text>
          </Pressable>) : <View style={styles.emptyCandidate}>
          <Text style={[styles.hint, !!error && styles.error]}>{error || (!ready ? 'Loading handwriting model…' : recognizing ? 'Recognizing…' : strokes.length ? 'No match yet. Try another stroke.' : 'Candidates appear after you draw.')}</Text>
          {!!error && <Pressable accessibilityRole="button" onPress={loadModel}><Text style={styles.retry}>Retry</Text></Pressable>}
        </View>}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Insert selected Hanzi" disabled={!candidates.length} onPress={insertCandidate} style={({ pressed }) => [styles.insertButton, (!candidates.length || pressed) && styles.insertDisabled]}>
        <Text style={styles.insertText}>Insert Hanzi</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  outputPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginHorizontal: 16, marginTop: 12, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  copyButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 4 },
  copyLabel: { color: colors.green, fontSize: 13, fontWeight: '700' },
  outputText: { flex: 1, color: colors.ink, fontSize: 22 },
  outputPlaceholder: { color: colors.muted, fontSize: 16 },
  drawingFrame: { flex: 1, marginHorizontal: 16, marginBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  canvas: { flex: 1, touchAction: 'none' } as any,
  placeholder: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#A9ADA5', fontSize: 18 },
  drawingActions: { position: 'absolute', left: 12, top: 12, gap: 9 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  bottomPanel: { paddingTop: 8, paddingBottom: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  candidateScroll: { flexGrow: 0, height: 68 },
  candidateContent: { paddingHorizontal: 16, alignItems: 'center', gap: 8, minWidth: '100%' },
  candidate: { width: 72, height: 58, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  candidateSelected: { borderColor: colors.green, borderWidth: 1.5, backgroundColor: colors.pale },
  hanzi: { color: colors.ink, fontSize: 32, lineHeight: 42 },
  emptyCandidate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.red, flexShrink: 1 },
  retry: { color: colors.green, fontWeight: '800' },
  insertButton: { height: 48, marginHorizontal: 16, marginTop: 9, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  insertDisabled: { opacity: 0.5 },
  insertText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
