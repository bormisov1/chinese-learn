import type { Stroke } from './types';

// The example's bundled HanziLookupJS matcher is used on Android.
const HanziLookup = require('./vendor/hanzilookup');
const data = require('./vendor/mmah.json');
let matcher: any;

export async function prepareRecognition(): Promise<void> {
  if (matcher) return;
  HanziLookup.data.mmah = {
    chars: data.chars,
    substrokes: HanziLookup.decodeCompact(data.substrokes),
  };
  matcher = new HanziLookup.Matcher('mmah');
}

export async function recognizeStrokes(strokes: Stroke[], width: number, height: number): Promise<string[]> {
  await prepareRecognition();
  const scale = 256 / Math.max(width, height, 1);
  const normalized = strokes.filter(stroke => stroke.length >= 2)
    .map(stroke => stroke.map(([x, y]) => [x * scale, y * scale]));
  if (!normalized.length) return [];
  const analyzed = new HanziLookup.AnalyzedCharacter(normalized);
  let results: string[] = [];
  matcher.match(analyzed, 12, (matches: { character: string }[]) => {
    results = matches.map(match => match.character);
  });
  return results;
}
