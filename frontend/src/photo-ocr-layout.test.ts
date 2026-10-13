import assert from 'node:assert/strict';
import test from 'node:test';
import { clipOverlappingWords, containedBox, recognizedWord } from './photo-ocr-layout';

test('OCR elements remain whole words even when characters have dictionary entries', () => {
  assert.equal(recognizedWord('喜欢'), '喜欢');
  assert.equal(recognizedWord('喜'), '喜');
  assert.equal(recognizedWord('欢'), '欢');
  assert.equal(recognizedWord('「學習」'), '学习');
  assert.equal(recognizedWord('ABC'), null);
  assert.equal(recognizedWord('你好，世界'), null);
});

test('OCR boxes align with contained portrait photos and clip to the view', () => {
  assert.deepEqual(containedBox({ x: 100, y: 200, width: 100, height: 50 }, 400, 800, 300, 500), {
    x: 87.5, y: 125, width: 62.5, height: 31.25,
  });
  assert.deepEqual(containedBox({ x: -20, y: 0, width: 40, height: 40 }, 400, 400, 200, 200), {
    x: 0, y: 0, width: 10, height: 20,
  });
  assert.equal(containedBox({ x: 1000, y: 0, width: 20, height: 20 }, 400, 400, 200, 200), null);
});

test('wide Tesseract word boxes stop at the next OCR word without splitting their text', () => {
  assert.deepEqual(clipOverlappingWords([
    { text: '喜欢', box: { x: 125, y: 105, width: 569, height: 92 } },
    { text: '学', box: { x: 365, y: 101, width: 90, height: 130 } },
  ]), [
    { text: '喜欢', box: { x: 125, y: 105, width: 240, height: 92 } },
    { text: '学', box: { x: 365, y: 101, width: 90, height: 130 } },
  ]);
});
