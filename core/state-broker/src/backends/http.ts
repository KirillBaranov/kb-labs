/**
 * HTTP state broker client
 */

import type { StateBroker, BrokerStats, HealthStatus } from '../index';

export class HTTPStateBroker implements StateBroker {
  constructor(private baseURL: string = 'http://localhost:7777') {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const res = await fetch(`${this.baseURL}/state/${encodeURIComponent(key)}`);

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      return (await res.json()) as T;
    } catch (error) {
      // Daemon unavailable - return null (graceful degradation)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return null;
      }
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const res = await fetch(`${this.baseURL}/state/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, ttl }),
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (error) {
      // Silent fail if daemon unavailable
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseURL}/state/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (error) {
      // Silent fail if daemon unavailable
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return;
      }
      throw error;
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      const url = pattern
        ? `${this.baseURL}/state/clear?pattern=${encodeURIComponent(pattern)}`
        : `${this.baseURL}/state/clear`;

      const res = await fetch(url, { method: 'POST' });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return;
      }
      throw error;
    }
  }

  async getStats(): Promise<BrokerStats> {
    const res = await fetch(`${this.baseURL}/stats`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as BrokerStats;
  }

  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`${this.baseURL}/health`);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as HealthStatus;
  }

  async stop(): Promise<void> {
    // HTTP client doesn't need cleanup
  }
}
