import type { ICache } from '@kb-labs/core-platform';

export interface BufferPolicy {
  /** Min TTL in ms — used at high load */
  minTTL: number;
  /** Max TTL in ms — used at low load */
  maxTTL: number;
  /** Max buffered calls per host */
  maxSize: number;
  /** Load threshold (0.0–1.0) above which minTTL is used */
  loadThreshold: number;
}

export const DEFAULT_BUFFER_POLICY: BufferPolicy = {
  minTTL: 30_000,
  maxTTL: 300_000,
  maxSize: 100,
  loadThreshold: 0.7,
};

export interface BufferedCall {
  requestId: string;
  adapter: string;
  method: string;
  args: unknown[];
  enqueuedAt: number;
}

/**
 * Adaptive buffer for offline host calls.
 * TTL adjusts based on current platform load — shorter when busy, longer when idle.
 */
export class AdaptiveBuffer {
  constructor(
    private readonly cache: ICache,
    private readonly policy: BufferPolicy = DEFAULT_BUFFER_POLICY,
  ) {}

  /** Calculate TTL based on current load (0.0–1.0) */
  ttlFor(load: number): number {
    if (load >= this.policy.loadThreshold) {return this.policy.minTTL;}
    const factor = 1 - load / this.policy.loadThreshold;
    return Math.round(this.policy.minTTL + (this.policy.maxTTL - this.policy.minTTL) * factor);
  }

  /** Enqueue a buffered call for an offline host */
  async enqueue(hostId: string, call: BufferedCall, load: number): Promise<void> {
    const key = `host:buffer:${hostId}`;
    const existing = (await this.cache.get<BufferedCall[]>(key)) ?? [];
    if (existing.length >= this.policy.maxSize) {
      throw new Error('HOST_BUFFER_FULL');
    }
    await this.cache.set(key, [...existing, call], this.ttlFor(load));
  }

  /** Flush and return all buffered calls for a host (clears buffer) */
  async flush(hostId: string): Promise<BufferedCall[]> {
    const key = `host:buffer:${hostId}`;
    const calls = (await this.cache.get<BufferedCall[]>(key)) ?? [];
    await this.cache.delete(key);
    return calls;
  }
}
