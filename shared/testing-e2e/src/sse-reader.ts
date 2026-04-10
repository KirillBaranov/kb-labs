/**
 * Minimal Server-Sent Events reader.
 *
 * Consumes `text/event-stream` responses and yields one `SseEvent` per
 * `event:`/`data:` pair. Terminates on close, explicit `untilEvent`, or timeout.
 */

export interface SseEvent {
  /** SSE `event:` field. Empty string if absent. */
  event: string;
  /** SSE `data:` field, concatenated with newlines if multi-line. */
  data: string;
  /** Optional `id:` field. */
  id?: string;
  /** Parsed JSON body if `data` is valid JSON, else undefined. */
  json?: unknown;
}

export interface SseOptions {
  headers?: Record<string, string>;
  /** If set, the iterator terminates after the first event with this name. */
  untilEvent?: string;
  /** Wall-clock timeout in ms. Default 30_000. */
  timeoutMs?: number;
}

/**
 * Async iterator over an SSE stream. Caller is responsible for iterating
 * (e.g. `for await (const event of readSse(url)) { ... }`).
 */
export async function* readSse(url: string, opts: SseOptions = {}): AsyncGenerator<SseEvent> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: 'text/event-stream', ...opts.headers },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`SSE fetch failed: ${(err as Error).message}`);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new Error(`SSE response not ok: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {return;}
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line (\n\n).
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const parsed = parseEvent(rawEvent);
        if (!parsed) {continue;}
        yield parsed;
        if (opts.untilEvent && parsed.event === opts.untilEvent) {
          return;
        }
      }
    }
  } finally {
    clearTimeout(timer);
    try { reader.cancel(); } catch {
      // intentionally empty: reader may already be closed
    }
  }
}

function parseEvent(raw: string): SseEvent | null {
  if (!raw.trim()) {return null;}
  let eventName = '';
  const dataLines: string[] = [];
  let id: string | undefined;

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) {continue;} // comment / keep-alive
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {continue;}
    const field = line.slice(0, colonIdx);
    // Per spec: strip a single leading space from value.
    const value = line.slice(colonIdx + 1).replace(/^ /, '');
    if (field === 'event') {eventName = value;}
    else if (field === 'data') {dataLines.push(value);}
    else if (field === 'id') {id = value;}
  }

  if (eventName === '' && dataLines.length === 0) {return null;}
  const data = dataLines.join('\n');
  let json: unknown;
  if (data) {
    try { json = JSON.parse(data); } catch { /* not JSON, leave undefined */ }
  }
  return { event: eventName, data, id, json };
}
