import type { TelemetryEvent } from '../types.js';

/**
 * Analytics proxy with telemetry convenience methods.
 *
 * Direct methods (track, identify) go through Platform API (unbuffered).
 * Convenience methods (event, metric, log) use batching + retry via
 * the telemetry ingestion endpoint for high-throughput use cases.
 */
export class AnalyticsProxy {
  private buffer: TelemetryEvent[] = [];
  private flushing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly platformCall: <T>(adapter: string, method: string, ...args: unknown[]) => Promise<T>,
    private readonly telemetryFetch: (events: TelemetryEvent[]) => Promise<void>,
    private readonly source: string,
    private readonly defaultTags: Record<string, string>,
    batchSize: number,
    flushIntervalMs: number,
    private readonly onError?: (error: Error) => void,
  ) {
    this.batchSize = batchSize;

    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => { void this.flush(); }, flushIntervalMs);
      if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  private batchSize: number;

  // ── Direct Platform API calls (unbuffered) ──────────────────────────

  async track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    await this.platformCall<void>('analytics', 'track', eventName, properties);
  }

  async identify(userId: string, traits?: Record<string, unknown>): Promise<void> {
    await this.platformCall<void>('analytics', 'identify', userId, traits);
  }

  // ── Convenience methods (buffered, via telemetry ingestion) ─────────

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

  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.event('metric', { name, value }, tags);
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    this.event('log', { level, message, ...data });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) {return;}

    this.flushing = true;
    const events = this.buffer.splice(0, this.batchSize);

    try {
      await this.telemetryFetch(events);
    } catch (err) {
      if (this.onError) {
        this.onError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.flushing = false;
    }

    if (this.buffer.length > 0) {
      void this.flush();
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    while (this.buffer.length > 0) {
      await this.flush();
    }
  }
}
