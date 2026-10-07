import type { WordExplanation } from './types';

// Keep a request shared across remounts (including React Strict Mode) until it settles.
const pending = new Map<string, { promise: Promise<WordExplanation>; listeners: Set<(partial: Partial<WordExplanation>) => void> }>();

export function requestExplanation(key: string, fetchExplanation: (onPartial: (partial: Partial<WordExplanation>) => void) => Promise<WordExplanation>, onPartial?: (partial: Partial<WordExplanation>) => void): Promise<WordExplanation> {
  const existing = pending.get(key);
  if (existing) { if (onPartial) existing.listeners.add(onPartial); return existing.promise; }
  const listeners = new Set<(partial: Partial<WordExplanation>) => void>();
  if (onPartial) listeners.add(onPartial);
  const request = Promise.resolve().then(() => fetchExplanation(partial => {
    for (const listener of listeners) listener(partial);
  }));
  pending.set(key, { promise: request, listeners });
  void request.then(
    () => { if (pending.get(key)?.promise === request) pending.delete(key); },
    () => { if (pending.get(key)?.promise === request) pending.delete(key); },
  );
  return request;
}
