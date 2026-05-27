/**
 * @module webhook/secret-store
 *
 * Cache-backed store for webhook delivery secrets.
 *
 * Each provisioned webhook gets a `current` secret. On rotation, the old
 * secret moves to `previous` with a 24-hour grace window — so external
 * services that cached the old secret keep working briefly after rotation.
 *
 * Cache key format:
 *   `webhook:secret:{ns}:{pluginId}:{event}`
 *   `webhook:secret:{ns}:{pluginId}:{event}:{instanceId}`  (multi: true)
 */

import type { ICache } from '@kb-labs/core-platform';

export interface WebhookSecretEntry {
  /** Active secret for new deliveries. */
  current: string;
  /** Previous secret, still valid until `previousExpiresAt`. */
  previous?: string;
  /** Unix timestamp (ms) after which `previous` is no longer valid. */
  previousExpiresAt?: number;
}

export interface WebhookSecretStore {
  get(ns: string, pluginId: string, event: string, instanceId?: string): Promise<WebhookSecretEntry | null>;
  set(ns: string, pluginId: string, event: string, entry: WebhookSecretEntry, instanceId?: string): Promise<void>;
  rotate(ns: string, pluginId: string, event: string, newSecret: string, instanceId?: string): Promise<WebhookSecretEntry>;
  delete(ns: string, pluginId: string, event: string, instanceId?: string): Promise<void>;
}

/** Grace window for previous secret after rotation: 24 hours. */
const PREVIOUS_SECRET_GRACE_MS = 86_400_000;

function cacheKey(ns: string, pluginId: string, event: string, instanceId?: string): string {
  const base = `webhook:secret:${ns}:${pluginId}:${event}`;
  return instanceId ? `${base}:${instanceId}` : base;
}

export class WebhookSecretStore {
  constructor(private readonly cache: ICache) {}

  async get(ns: string, pluginId: string, event: string, instanceId?: string): Promise<WebhookSecretEntry | null> {
    return this.cache.get<WebhookSecretEntry>(cacheKey(ns, pluginId, event, instanceId));
  }

  async set(ns: string, pluginId: string, event: string, entry: WebhookSecretEntry, instanceId?: string): Promise<void> {
    await this.cache.set(cacheKey(ns, pluginId, event, instanceId), entry);
  }

  async rotate(ns: string, pluginId: string, event: string, newSecret: string, instanceId?: string): Promise<WebhookSecretEntry> {
    const existing = await this.get(ns, pluginId, event, instanceId);
    const entry: WebhookSecretEntry = { current: newSecret };

    if (existing) {
      entry.previous = existing.current;
      entry.previousExpiresAt = Date.now() + PREVIOUS_SECRET_GRACE_MS;
    }

    await this.set(ns, pluginId, event, entry, instanceId);
    return entry;
  }

  async delete(ns: string, pluginId: string, event: string, instanceId?: string): Promise<void> {
    await this.cache.delete(cacheKey(ns, pluginId, event, instanceId));
  }
}
