import type { SseEvent } from '../sse-reader.js';

/**
 * Asserts SSE events arrive in the exact order of `expectedTypes`.
 * Extra events between expected ones are allowed; missing events throw.
 */
export function assertSseOrder(events: SseEvent[], expectedTypes: string[]): void {
  let cursor = 0;
  for (const event of events) {
    if (cursor >= expectedTypes.length) break;
    if (event.event === expectedTypes[cursor]) {
      cursor++;
    }
  }
  if (cursor < expectedTypes.length) {
    const received = events.map((e) => e.event);
    throw new Error(
      `SSE order assertion failed.\n` +
      `Expected (in order): ${expectedTypes.join(', ')}\n` +
      `Received: ${received.join(', ')}\n` +
      `Missing: ${expectedTypes[cursor]}`,
    );
  }
}

/**
 * Asserts no two events share the same event type AND id combination.
 * Events without an id field are compared by type + data.
 */
export function assertNoSseDuplicates(events: SseEvent[]): void {
  const seen = new Set<string>();
  for (const event of events) {
    const key = event.id ? `${event.event}::${event.id}` : `${event.event}::${event.data}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate SSE event detected: type="${event.event}" id="${event.id ?? '(none)'}"`);
    }
    seen.add(key);
  }
}
