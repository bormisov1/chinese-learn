type LookupPoint = readonly [number, number, ...number[]];

// The WASM lookup casts point coordinates to u8 and finds stroke corners using
// pixel distances. Keep the character in a roughly 200px square regardless of
// the browser canvas size, while preserving its aspect ratio.
export function coordinatesForHanziLookup(strokes: readonly (readonly LookupPoint[])[]): number[][][] {
  const drawable = strokes.filter(stroke => stroke.length >= 2);
  if (!drawable.length) return [];

  const points = drawable.flat();
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const width = Math.max(...points.map(([x]) => x)) - left;
  const height = Math.max(...points.map(([, y]) => y)) - top;
  const scale = 200 / Math.max(width, height, 1);
  const xOffset = (255 - width * scale) / 2;
  const yOffset = (255 - height * scale) / 2;

  return drawable.map(stroke => stroke.map(([x, y]) => [
    Math.max(0, Math.min(255, Math.round((x - left) * scale + xOffset))),
    Math.max(0, Math.min(255, Math.round((y - top) * scale + yOffset))),
  ]));
}
