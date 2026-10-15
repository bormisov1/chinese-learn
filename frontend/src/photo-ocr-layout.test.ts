import assert from 'node:assert/strict';
import test from 'node:test';
import { breakdownRecognizedWord, clipOverlappingWords, containedBox, coveredBox, groupOcrCharacters, recognizedWord } from './photo-ocr-layout';

const box = (text: string, x: number, y = 10, width = 18) => ({ text, box: { x, y, width, height: 20 } });
const dictionary = (...words: string[]) => new Map(words.map(hanzi => [hanzi, { hanzi, pinyin: hanzi, russian: hanzi }]));

test('OCR elements remain whole words even when characters have dictionary entries', () => {
  assert.equal(recognizedWord('喜欢'), '喜欢');
  assert.equal(recognizedWord('喜'), '喜');
  assert.equal(recognizedWord('欢'), '欢');
  assert.equal(recognizedWord('「學習」'), '学习');
  assert.equal(recognizedWord('ABC'), null);
  assert.equal(recognizedWord('你好，世界'), null);
});

test('unknown OCR phrase breaks into adjacent dictionary words without overlaps', () => {
  const parts = breakdownRecognizedWord('研究生命', dictionary('研究', '研究生', '生命', '命', '研', '究'));
  assert.deepEqual(parts.map(word => word.hanzi), ['研究', '生命']);
});

test('breakdown prefers earlier consecutive words when alternatives cover the same amount', () => {
  const parts = breakdownRecognizedWord('甲乙丙丁戊', dictionary('甲乙', '乙丙', '丙丁', '丁戊'));
  assert.deepEqual(parts.map(word => word.hanzi), ['甲乙', '丙丁']);
});

test('breakdown keeps multi-character words adjacent instead of inserting a single character', () => {
  const parts = breakdownRecognizedWord('甲乙丙丁戊', dictionary('甲乙', '丙丁', '丙', '丁戊'));
  assert.deepEqual(parts.map(word => word.hanzi), ['甲乙', '丙丁']);
});

test('breakdown uses available single characters but preserves whole dictionary matches', () => {
  const words = dictionary('喜欢', '学', '习', '中', '文');
  assert.deepEqual(breakdownRecognizedWord('喜欢', words), []);
  assert.deepEqual(breakdownRecognizedWord('「學習中文」', words).map(word => word.hanzi), ['学', '习', '中', '文']);
  assert.deepEqual(breakdownRecognizedWord('ABC', words), []);
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

test('camera overlay boxes use the same center crop as the live preview', () => {
  assert.deepEqual(coveredBox({ x: 100, y: 200, width: 100, height: 50 }, 400, 800, 300, 500), {
    x: 75, y: 100, width: 75, height: 37.5,
  });
  assert.equal(coveredBox({ x: 0, y: 0, width: 20, height: 20 }, 400, 800, 300, 500), null);
});

test('separate characters in one sentence become complete dictionary words', () => {
  const source = [box('我', 0), box('喜', 20), box('欢', 40), box('學', 60), box('習', 80), box('中', 100), box('文', 120)];
  const grouped = groupOcrCharacters(source, dictionary('我', '喜', '欢', '喜欢', '学', '习', '学习', '中', '文', '中文'));
  assert.deepEqual(grouped.map(word => word.text), ['我', '喜欢', '学习', '中文']);
  assert.deepEqual(grouped[1].box, { x: 20, y: 10, width: 38, height: 20 });
});

test('a multi-character OCR element stays intact while adjacent single characters group', () => {
  const grouped = groupOcrCharacters([box('喜欢', 0, 10, 38), box('学', 40), box('习', 60)], dictionary('喜', '欢', '喜欢', '学', '习', '学习'));
  assert.deepEqual(grouped.map(word => word.text), ['喜欢', '学习']);
});

test('character grouping stops at a line break or a wide gap', () => {
  const grouped = groupOcrCharacters([box('学', 0), box('习', 20, 60), box('中', 100), box('文', 160)], dictionary('学', '习', '学习', '中', '文', '中文'));
  assert.deepEqual(grouped.map(word => word.text), ['学', '习', '中', '文']);
});

test('balanced dictionary words win over an ambiguous long prefix', () => {
  const grouped = groupOcrCharacters([box('研', 0), box('究', 20), box('生', 40), box('命', 60)], dictionary('研究', '研究生', '生命', '命'));
  assert.deepEqual(grouped.map(word => word.text), ['研究', '生命']);
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
