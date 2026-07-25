import {
  createStateBroker,
  type StateBroker,
} from "@kb-labs/core-state-broker";
import type { ICache } from "@kb-labs/sdk/adapters";

export { manifest } from "./manifest.js";

export interface StateBrokerCacheConfig {
  url?: string;
  namespace?: string;
  fallbackToMemory?: boolean;
}

export class StateBrokerCacheAdapter implements ICache {
  private readonly broker: StateBroker;
  private readonly namespace: string;

  constructor(config: StateBrokerCacheConfig = {}) {
    this.namespace = config.namespace ?? "kb:";
    this.broker = createStateBroker({
      backend: config.url ? "http" : "memory",
      url: config.url,
    });
  }

  get<T>(key: string): Promise<T | null> {
    return this.broker.get<T>(this.key(key));
  }

  set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.broker.set(this.key(key), value, ttl);
  }

  delete(key: string): Promise<void> {
    return this.broker.delete(this.key(key));
  }

  clear(pattern?: string): Promise<void> {
    return this.broker.clear(this.key(pattern ?? "*"));
  }

  zadd(key: string, score: number, member: string): Promise<void> {
    return this.broker.zadd(this.key(key), score, member);
  }

  zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    return this.broker.zrangebyscore(this.key(key), min, max);
  }

  zrem(key: string, member: string): Promise<void> {
    return this.broker.zrem(this.key(key), member);
  }

  setIfNotExists<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    return this.broker.setIfNotExists(this.key(key), value, ttl);
  }

  private key(key: string): string {
    return `${this.namespace}${key}`;
  }
}

export function createAdapter(
  config?: StateBrokerCacheConfig,
): StateBrokerCacheAdapter {
  return new StateBrokerCacheAdapter(config);
}

export default createAdapter;
