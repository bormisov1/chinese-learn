import { CHAT_PRESETS, type ChatPreset, type ChatReply } from './chat';

export type ChatMessage = { role: 'user'; text: string } | { role: 'assistant'; text: string; reply: ChatReply };
export type Conversation = { id: string; title: string; preset: ChatPreset; messages: ChatMessage[]; updatedAt: number };

const KEY = 'hanzi-deck:chat-history:v1';
const presets = CHAT_PRESETS.map(item => item.id);

export function loadChatHistory(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): Conversation[] {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Conversation =>
      !!item && typeof item.id === 'string' && typeof item.title === 'string' &&
      presets.includes(item.preset) && typeof item.updatedAt === 'number' &&
      Array.isArray(item.messages) && item.messages.every((message: unknown) => {
        if (!message || typeof message !== 'object') return false;
        const record = message as Record<string, unknown>;
        return (record.role === 'user' || record.role === 'assistant') && typeof record.text === 'string' &&
          (record.role === 'user' || (!!record.reply && typeof record.reply === 'object'));
      })
    ).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function saveChatHistory(conversations: Conversation[], storage: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  storage?.setItem(KEY, JSON.stringify(conversations));
}
