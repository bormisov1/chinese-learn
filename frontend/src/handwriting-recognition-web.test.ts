import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { coordinatesForHanziLookup } from './handwriting/recognition-web-coordinates';
import type { Point, Stroke } from './handwriting/types';

// Hand-drawn 十 from the HanziLookup matcher tests:
// https://github.com/gugray/hanzi_lookup/blob/master/hanzi_lookup/src/matcher.rs
const ten: Stroke[] = [
  [[76, 127, 0], [84, 127, 1], [119, 128, 2], [138, 130, 3], [153, 131, 4], [169, 131, 5]],
  [[129, 60, 6], [128, 74, 7], [128, 102, 8], [129, 143, 9], [130, 170, 10], [131, 198, 11], [131, 203, 12]],
];

test('web recognition keeps strokes inside the WASM coordinate range', () => {
  const large = ten.map(stroke => stroke.map(([x, y, t]): Point => [x * 2 + 100, y * 2 + 100, t]));
  const converted = coordinatesForHanziLookup(large);
  assert.equal(converted.length, 2);
  assert.ok(converted.flat(2).every(value => value >= 0 && value <= 255));
  assert.deepEqual(converted, coordinatesForHanziLookup(ten));
  assert.deepEqual(converted, coordinatesForHanziLookup(ten.map(stroke => stroke.map(([x, y]) => [x, y] as const))));
  assert.deepEqual(coordinatesForHanziLookup([]), []);
});

test('web recognition finds 十 on a large canvas with the bundled WASM', async () => {
  const assets = join(dirname(fileURLToPath(import.meta.url)), '../public/hanzi-lookup');
  const glue = readFileSync(join(assets, 'hanzi_lookup.js'), 'utf8');
  const wasm = readFileSync(join(assets, 'hanzi_lookup_bg.wasm'));
  const context: {
    self: { wasm_bindgen?: { (module: Buffer): Promise<unknown>; lookup(strokes: number[][][], limit: number): string } };
    TextDecoder: typeof TextDecoder;
    TextEncoder: typeof TextEncoder;
    WebAssembly: typeof WebAssembly;
    URL: typeof URL;
    Request: typeof Request;
  } = { self: {}, TextDecoder, TextEncoder, WebAssembly, URL, Request };
  runInNewContext(glue, context);
  const recognizer = context.self.wasm_bindgen!;
  await recognizer(wasm);

  const large = ten.map(stroke => stroke.map(([x, y, t]): Point => [x * 2 + 100, y * 2 + 100, t]));
  const matches = JSON.parse(recognizer.lookup(coordinatesForHanziLookup(large), 12)) as { hanzi: string }[];
  assert.equal(matches[0]?.hanzi, '十');
});
