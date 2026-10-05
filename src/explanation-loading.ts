import type { WordExplanation } from './types';

// Keep a request shared across remounts (including React Strict Mode) until it settles.
const pending = new Map<string, Promise<WordExplanation>>();

export function requestExplanation(key: string, fetchExplanation: () => Promise<WordExplanation>): Promise<WordExplanation> {
  const existing = pending.get(key);
  if (existing) return existing;
  const request = Promise.resolve().then(fetchExplanation);
  pending.set(key, request);
  void request.then(
    () => { if (pending.get(key) === request) pending.delete(key); },
    () => { if (pending.get(key) === request) pending.delete(key); },
  );
  return request;
}
