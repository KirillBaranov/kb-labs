import { readSse } from '../sse-reader.js';
import type { SseEvent } from '../sse-reader.js';

export type { SseEvent };

export interface CollectSseOptions {
  /** Stop after collecting this many events. */
  count?: number;
  /** Stop after receiving an event with this type (inclusive). */
  untilEvent?: string;
  /** Wall-clock timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Extra HTTP headers forwarded to the SSE request. */
  headers?: Record<string, string>;
}

/**
 * Collects SSE events from `url` into an array.
 * Stops on `count`, `untilEvent`, stream close, or timeout.
 */
export async function collectSseEvents(url: string, opts: CollectSseOptions = {}): Promise<SseEvent[]> {
  const events: SseEvent[] = [];

  for await (const event of readSse(url, {
    untilEvent: opts.untilEvent,
    timeoutMs: opts.timeoutMs,
    headers: opts.headers,
  })) {
    events.push(event);
    if (opts.count !== undefined && events.length >= opts.count) {
      break;
    }
  }

  return events;
}

/**
 * Returns the first event matching `eventType`, or rejects on timeout.
 */
export async function waitForSseEvent(
  url: string,
  eventType: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<SseEvent> {
  for await (const event of readSse(url, { timeoutMs: opts.timeoutMs ?? 30_000, headers: opts.headers })) {
    if (event.event === eventType) {
      return event;
    }
  }
  throw new Error(`SSE stream ended before receiving event type "${eventType}"`);
}

/**
 * Asserts the SSE connection at `url` closes on its own without hanging.
 * Rejects if the stream is still open after `timeoutMs`.
 */
export async function expectSseTerminates(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5_000;

  await Promise.race([
    (async () => {
      // Drain all events — the stream must close naturally.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of readSse(url, { timeoutMs, headers: opts.headers })) {
        // just consume
      }
    })(),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`SSE stream did not terminate within ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}
