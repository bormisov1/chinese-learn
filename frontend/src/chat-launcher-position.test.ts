import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_LAUNCHER_POSITION_KEY, clampChatLauncherPosition, loadChatLauncherPosition, saveChatLauncherPosition } from './chat-launcher-position';

test('chat launcher position stays on screen, including after a smaller viewport', () => {
  assert.deepEqual(clampChatLauncherPosition({ x: -20, y: 0 }, 390, 844, 47, 34), { x: 8, y: 55 });
  assert.deepEqual(clampChatLauncherPosition({ x: 370, y: 900 }, 390, 844, 47, 34), { x: 331, y: 751 });
  assert.deepEqual(clampChatLauncherPosition({ x: 331, y: 751 }, 320, 568, 47, 34), { x: 261, y: 475 });
});

test('chat launcher position persists locally and ignores invalid saved data', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveChatLauncherPosition({ x: 85, y: 190 }, storage);
  assert.equal(values.get(CHAT_LAUNCHER_POSITION_KEY), '{"x":85,"y":190}');
  assert.deepEqual(loadChatLauncherPosition(storage), { x: 85, y: 190 });
  values.set(CHAT_LAUNCHER_POSITION_KEY, '{"x":"85","y":190}');
  assert.equal(loadChatLauncherPosition(storage), null);
});
