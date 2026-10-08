export type ChatLauncherPosition = { x: number; y: number };

export const CHAT_LAUNCHER_POSITION_KEY = 'hanzi-deck:chat-launcher-position:v1';
const LAUNCHER_SIZE = 51;
const EDGE_GAP = 8;

export function clampChatLauncherPosition(position: ChatLauncherPosition, width: number, height: number, topInset: number, bottomInset: number): ChatLauncherPosition {
  const minY = topInset + EDGE_GAP;
  return {
    x: Math.min(Math.max(position.x, EDGE_GAP), Math.max(EDGE_GAP, width - LAUNCHER_SIZE - EDGE_GAP)),
    y: Math.min(Math.max(position.y, minY), Math.max(minY, height - bottomInset - LAUNCHER_SIZE - EDGE_GAP)),
  };
}

export function loadChatLauncherPosition(storage?: Pick<Storage, 'getItem'>): ChatLauncherPosition | null {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(CHAT_LAUNCHER_POSITION_KEY) ?? 'null');
    return value && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y)
      ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}

export function saveChatLauncherPosition(position: ChatLauncherPosition, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage)?.setItem(CHAT_LAUNCHER_POSITION_KEY, JSON.stringify(position)); }
  catch { /* The button still moves when browser storage is unavailable. */ }
}
