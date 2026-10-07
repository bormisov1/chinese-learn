import type { WordExplanation } from './types';

// Close unfinished strings and containers so a growing JSON response can be previewed.
// The original response is always parsed and validated separately after streaming ends.
export function partialExplanation(json: string): Partial<WordExplanation> | null {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  let end = json.length;
  for (let index = 0; index < end; index++) {
    const char = json[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') closers.push('}');
    else if (char === '[') closers.push(']');
    else if (char === '}' || char === ']') closers.pop();
  }
  if (escaped) end--;
  let candidate = json.slice(0, end).trimEnd();
  if (inString) candidate += '"';
  if (candidate.endsWith(':')) candidate += 'null';
  if (candidate.endsWith(',')) candidate = candidate.slice(0, -1);
  candidate += closers.reverse().join('');
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Partial<WordExplanation> : null;
  } catch { return null; }
}

export async function readExplanationStream(response: Response, onPartial?: (partial: Partial<WordExplanation>) => void): Promise<unknown> {
  if (!response.body) throw new Error('DeepSeek returned an empty explanation stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let done = false;
  const processEvent = (event: string) => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { done = true; return; }
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(chunk.error.message ?? 'DeepSeek stream error.');
    if (chunk.choices?.[0]?.finish_reason === 'length') throw new Error('DeepSeek returned an incomplete explanation. Please refresh to try again.');
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      content += delta;
      const preview = partialExplanation(content);
      if (preview) onPartial?.(preview);
    }
  };
  try {
    while (!done) {
      const { value, done: streamEnded } = await reader.read();
      if (streamEnded) break;
      pending += decoder.decode(value, { stream: true });
      const events = pending.split(/\r?\n\r?\n/);
      pending = events.pop() ?? '';
      for (const event of events) { processEvent(event); if (done) break; }
    }
    pending += decoder.decode();
    if (pending.trim() && !done) processEvent(pending);
  } finally { reader.releaseLock(); }
  if (!done) throw new Error('DeepSeek explanation stream ended early. Please refresh to try again.');
  return JSON.parse(content);
}
