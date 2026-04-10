/**
 * Typed Cache proxy — wraps Platform API calls with Cache-specific types.
 */
export class CacheProxy {
  constructor(private readonly call: <T>(adapter: string, method: string, ...args: unknown[]) => Promise<T>) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.call<T | null>('cache', 'get', key);
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    await this.call<void>('cache', 'set', key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.call<void>('cache', 'delete', key);
  }

  async clear(pattern?: string): Promise<void> {
    await this.call<void>('cache', 'clear', pattern);
  }
}
