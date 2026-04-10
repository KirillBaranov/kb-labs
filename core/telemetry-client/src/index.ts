/**
 * @module @kb-labs/telemetry-client
 * Lightweight telemetry client for KB Labs platform.
 *
 * Zero runtime dependencies. Works in Node.js and browser.
 * Batches events and flushes to the platform ingestion endpoint.
 *
 * @example
 * ```typescript
 * import { KBTelemetry } from '@kb-labs/telemetry-client';
 *
 * const telemetry = new KBTelemetry({
 *   endpoint: 'http://localhost:4000',
 *   apiKey: 'your-token',
 *   source: 'my-product',
 * });
 *
 * telemetry.event('user.signup', { plan: 'pro' });
 * telemetry.event('api.request', { method: 'POST', path: '/checkout', durationMs: 142 });
 *
 * // Flush on shutdown (automatic in Node.js via process handlers)
 * await telemetry.flush();
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface KBTelemetryOptions {
  /** Platform Gateway endpoint (e.g., "http://localhost:4000") */
  endpoint: string;
  /** API key / Bearer token for authentication */
  apiKey: string;
  /** Source product name — identifies who sent the event */
  source: string;
  /** Max events per batch (default: 50) */
  batchSize?: number;
  /** Auto-flush interval in ms (default: 5000). Set 0 to disable. */
  flushIntervalMs?: number;
  /** Max retry attempts for failed flushes (default: 2) */
  maxRetries?: number;
  /** Custom tags applied to all events from this client */
  defaultTags?: Record<string, string>;
  /** Called on flush errors (default: console.error) */
  onError?: (error: Error, events: TelemetryEvent[]) => void;
}

export interface TelemetryEvent {
  source: string;
  type: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
  tags?: Record<string, string>;
}

interface IngestResponse {
  accepted: number;
  rejected: number;
  errors?: Array<{ index: number; message: string }>;
}

// ── Client ────────────────────────────────────────────────────────────────

export class KBTelemetry {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly source: string;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly defaultTags: Record<string, string>;
  private readonly onError: (error: Error, events: TelemetryEvent[]) => void;

  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(options: KBTelemetryOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.source = options.source;
    this.batchSize = options.batchSize ?? 50;
    this.maxRetries = options.maxRetries ?? 2;
    this.defaultTags = options.defaultTags ?? {};
    this.onError = options.onError ?? ((err) => console.error('[KBTelemetry]', err.message));

    const interval = options.flushIntervalMs ?? 5000;
    if (interval > 0) {
      this.flushTimer = setInterval(() => { void this.flush(); }, interval);
      // Unref so the timer doesn't keep the process alive
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }

    // Auto-flush on process exit (Node.js only)
    if (typeof process !== 'undefined' && process.on) {
      const exitHandler = () => { void this.shutdown(); };
      process.on('beforeExit', exitHandler);
      process.on('SIGTERM', exitHandler);
      process.on('SIGINT', exitHandler);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Track a named event with optional payload and tags. */
  event(type: string, payload?: Record<string, unknown>, tags?: Record<string, string>): void {
    this.buffer.push({
      source: this.source,
      type,
      timestamp: new Date().toISOString(),
      payload,
      tags: { ...this.defaultTags, ...tags },
    });

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  /** Convenience: track a metric value. */
  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.event('metric', { name, value }, tags);
  }

  /** Convenience: track a log entry. */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    this.event('log', { level, message, ...data });
  }

  /** Flush buffered events to the platform. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) {return;}

    this.flushing = true;
    const events = this.buffer.splice(0, this.batchSize);

    try {
      await this.sendWithRetry(events);
    } catch (err) {
      this.onError(err instanceof Error ? err : new Error(String(err)), events);
    } finally {
      this.flushing = false;
    }

    // If buffer still has events, flush again
    if (this.buffer.length > 0) {
      void this.flush();
    }
  }

  /** Flush all remaining events and stop the timer. */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining in batches
    while (this.buffer.length > 0) {
      await this.flush();
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async sendWithRetry(events: TelemetryEvent[]): Promise<IngestResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.send(events);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Retry only on network/server errors, not client errors
        if (attempt < this.maxRetries) {
          await sleep(Math.min(1000 * 2 ** attempt, 5000));
        }
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

  private async send(events: TelemetryEvent[]): Promise<IngestResponse> {
    const url = `${this.endpoint}/telemetry/v1/ingest`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Telemetry ingest failed: ${response.status} ${text}`);
    }

    return (await response.json()) as IngestResponse;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
