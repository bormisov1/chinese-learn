import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/context';
import { colors } from '@/theme';
import { Button, Header, shell } from '@/ui';

const SIZE = 360;
type Point = [number, number];
type Stroke = { snapshot: ImageData; points: Point[] };
type Match = { hanzi: string; score: number };
type Verdict = { shapeScore: number; matches: Match[] };

export default function WritingExperiment() {
  const { data, ready } = useStore();
  const candidates = useMemo(() => data.words.filter(w => [...w.hanzi].length === 1), [data.words]);
  const [index, setIndex] = useState(0), [strokes, setStrokes] = useState<Stroke[]>([]), [verdict, setVerdict] = useState<Verdict>(), [recognizerReady, setRecognizerReady] = useState(false), [recognizing, setRecognizing] = useState(false), [recognizerError, setRecognizerError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null), workerRef = useRef<Worker | null>(null), drawing = useRef(false), last = useRef<Point | null>(null), activeStroke = useRef<Stroke | null>(null), pendingShape = useRef(0);
  const target = candidates[index % Math.max(1, candidates.length)];

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const worker = new Worker('/hanzi-lookup/worker.js');
    workerRef.current = worker;
    worker.onmessage = event => {
      if (event.data?.what === 'loaded') { setRecognizerReady(true); setRecognizerError(''); }
      if (event.data?.what === 'lookup') { setVerdict({ shapeScore: pendingShape.current, matches: event.data.matches ?? [] }); setRecognizing(false); }
    };
    worker.onerror = () => { setRecognizerError('HanziLookup failed to load.'); setRecognizing(false); };
    worker.postMessage({ wasm_uri: '/hanzi-lookup/hanzi_lookup_bg.wasm' });
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFDF8'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }, [target?.id]);

  const point = (event: PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [(event.clientX - rect.left) * SIZE / rect.width, (event.clientY - rect.top) * SIZE / rect.height] as Point;
  };
  const begin = (event: PointerEvent) => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!, start = point(event);
    const stroke = { snapshot: ctx.getImageData(0, 0, SIZE, SIZE), points: [start] };
    activeStroke.current = stroke; setStrokes(old => [...old, stroke]);
    drawing.current = true; last.current = start; canvas.setPointerCapture(event.pointerId); setVerdict(undefined);
  };
  const move = (event: PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const next = point(event), ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(...last.current); ctx.lineTo(...next); ctx.stroke(); last.current = next; activeStroke.current?.points.push(next);
  };
  const end = () => { drawing.current = false; last.current = null; activeStroke.current = null; };
  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#FFFDF8'; ctx.fillRect(0, 0, SIZE, SIZE); setStrokes([]); setVerdict(undefined);
  };
  const undo = () => {
    const ctx = canvasRef.current?.getContext('2d'), previous = strokes.at(-1); if (!ctx || !previous) return;
    ctx.putImageData(previous.snapshot, 0, 0); setStrokes(s => s.slice(0, -1)); setVerdict(undefined);
  };
  const shapeScore = () => {
    const canvas = canvasRef.current!;
    const user = canvas.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
    const reference = document.createElement('canvas'); reference.width = SIZE; reference.height = SIZE;
    const ctx = reference.getContext('2d')!; ctx.fillStyle = '#FFFDF8'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = colors.ink; ctx.font = 'bold 280px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(target.hanzi, SIZE / 2, SIZE / 2 + 8);
    const expected = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let overlap = 0, union = 0, userInk = 0, expectedInk = 0;
    for (let p = 0; p < user.length; p += 16) { const a = user[p] < 180, b = expected[p] < 180; if (a) userInk++; if (b) expectedInk++; if (a && b) overlap++; if (a || b) union++; }
    const shape = union ? overlap / union : 0, density = Math.min(userInk, expectedInk) / Math.max(1, Math.max(userInk, expectedInk));
    return Math.round(100 * (shape * .75 + density * .25));
  };
  const check = () => {
    if (!target || !strokes.length || !workerRef.current || !recognizerReady) return;
    pendingShape.current = shapeScore(); setRecognizing(true); setVerdict(undefined);
    workerRef.current.postMessage({ strokes: strokes.map(stroke => stroke.points), limit: 5 });
  };
  const next = () => { clear(); setIndex(i => (i + 1) % Math.max(1, candidates.length)); };

  if (!ready) return null;
  if (Platform.OS !== 'web') return <View style={[shell.page, shell.content]}><Header title="Writing experiment" subtitle="Drawing recognition currently requires the web version."/></View>;
  if (!target) return <ScrollView style={shell.page} contentContainerStyle={shell.content}><Header eyebrow="Experimental" title="Hanzi writing" subtitle="Import at least one single-character vocabulary card first."/></ScrollView>;
  const recognized = verdict?.matches[0]?.hanzi;
  return <ScrollView style={shell.page} contentContainerStyle={shell.content}>
    <Header eyebrow="Experimental · local only" title="Write the Hanzi" subtitle={`${target.pinyin} · ${target.russian}`}/>
    <View style={styles.target}><Text style={styles.prompt}>TARGET</Text><Text style={styles.hiddenTarget}>?</Text><Text style={styles.counter}>{index + 1} / {candidates.length}</Text></View>
    <View style={styles.canvasWrap}>
      <canvas key={target.id} ref={canvasRef} onPointerDown={begin as any} onPointerMove={move as any} onPointerUp={end} onPointerCancel={end} style={{ width: '100%', maxWidth: SIZE, aspectRatio: '1', touchAction: 'none', cursor: 'crosshair', borderRadius: 18 }} />
      <View pointerEvents="none" style={styles.guides}><View style={styles.horizontal}/><View style={styles.vertical}/></View>
    </View>
    <View style={styles.actions}><Button secondary label="Undo" icon="arrow-undo" onPress={undo} disabled={!strokes.length || recognizing}/><Button secondary label="Clear" icon="trash-outline" onPress={clear} disabled={!strokes.length || recognizing}/><Button label={recognizing ? 'Recognizing…' : recognizerReady ? 'Recognize' : 'Loading recognizer…'} icon="scan" onPress={check} disabled={!strokes.length || recognizing || !recognizerReady}/></View>
    {recognizerError ? <Text style={styles.error}>{recognizerError}</Text> : null}
    {verdict && <View style={styles.result}><Text style={styles.recognized}>{recognized || '—'}</Text><View style={{ flex: 1 }}><Text style={styles.resultTitle}>{recognized === target.hanzi ? 'Recognized target' : recognized ? `Recognized as ${recognized}` : 'No match'}</Text><Text style={styles.answer}>Candidates: {verdict.matches.map(match => `${match.hanzi} ${Math.round(match.score)}`).join(' · ') || 'none'}</Text><Text style={styles.answer}>Target: {target.hanzi} · shape {verdict.shapeScore}%</Text></View><Button secondary label="Next" onPress={next}/></View>}
    <Text style={styles.note}>Recognition uses HanziLookup Rust/WASM and the order, direction, length, and position of your strokes. It returns five local candidates from about 9,500 characters. No image or stroke data is uploaded. Shape score remains experimental. HanziLookup: LGPL; stroke data: Arphic Public License.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({ target: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, prompt: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }, hiddenTarget: { marginLeft: 10, color: colors.coral, fontSize: 24, fontWeight: '800' }, counter: { marginLeft: 'auto', color: colors.muted }, canvasWrap: { width: '100%', maxWidth: SIZE, alignSelf: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, position: 'relative', overflow: 'hidden' }, guides: { ...StyleSheet.absoluteFillObject }, horizontal: { position: 'absolute', top: '50%', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#DED9CC' }, vertical: { position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#DED9CC' }, actions: { flexDirection: 'row', gap: 8, marginTop: 14 }, result: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.pale, borderRadius: 16, padding: 15, marginTop: 16 }, recognized: { minWidth: 50, color: colors.green, fontSize: 42, fontWeight: '800', textAlign: 'center' }, resultTitle: { color: colors.ink, fontWeight: '800', fontSize: 16 }, answer: { color: colors.muted, marginTop: 4 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 18 }, error: { color: colors.red, marginTop: 12 } });
