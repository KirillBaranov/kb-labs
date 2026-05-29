/**
 * Unit tests for provisionWebhook.
 *
 * Covers: first provision, re-provision (rotate), onProvision callback,
 * onProvision failure (log + continue), unknown plugin/event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '@kb-labs/core-platform';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookSecretStore } from '../webhook/secret-store.js';
import { provisionWebhook } from '../webhook/provision.js';
import type { WebhookManifestEntry } from '../webhook/router.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'test-plugin';
const EVENT = 'alert';
const NS = 'ns-test';
const PLUGIN_ROOT = '/plugins/test-plugin';
const BASE_URL = 'http://localhost:4000';

function makeManifest(opts?: { onProvision?: string; multi?: boolean }): ManifestV3 {
  return {
    schema: 'kb.plugin/3',
    id: PLUGIN_ID,
    version: '1.0.0',
    webhooks: {
      handlers: [
        {
          event: EVENT,
          handler: './dist/webhooks/alert.js#default',
          auth: { type: 'secret', header: 'X-Webhook-Secret' },
          ...(opts?.multi ? { multi: true } : {}),
          ...(opts?.onProvision ? { onProvision: opts.onProvision } : {}),
        },
      ],
    },
  };
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(function () { return noopLogger; }),
} as unknown as ILogger;

function makeManifestEntries(manifest: ManifestV3): WebhookManifestEntry[] {
  return [{ pluginId: PLUGIN_ID, manifest, pluginRoot: PLUGIN_ROOT }];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('provisionWebhook', () => {
  let cache: InMemoryCache;
  let store: WebhookSecretStore;

  beforeEach(() => {
    cache = new InMemoryCache();
    store = new WebhookSecretStore(cache);
    vi.clearAllMocks();
  });

  it('returns url, secret, rotated=false on first provision', async () => {
    const manifests = makeManifestEntries(makeManifest());
    const backend = { execute: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    expect(result.rotated).toBe(false);
    expect(typeof result.secret).toBe('string');
    expect(result.secret).toHaveLength(64); // 32 bytes as hex
    expect(result.url).toBe(`${BASE_URL}/webhooks/${PLUGIN_ID}/${EVENT}`);
  });

  it('stores the secret in the secret store after provision', async () => {
    const manifests = makeManifestEntries(makeManifest());
    const backend = { execute: vi.fn() };

    const { secret } = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    const entry = await store.get(NS, PLUGIN_ID, EVENT);
    expect(entry).not.toBeNull();
    expect(entry!.current).toBe(secret);
  });

  it('returns rotated=true on re-provision (secret already exists)', async () => {
    const manifests = makeManifestEntries(makeManifest());
    const backend = { execute: vi.fn() };

    // First provision
    await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    // Second provision (rotation)
    const result = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    expect(result.rotated).toBe(true);
    // Old secret preserved as previous for grace window
    const entry = await store.get(NS, PLUGIN_ID, EVENT);
    expect(entry!.previous).toBeDefined();
  });

  it('calls onProvision handler after provisioning', async () => {
    const manifests = makeManifestEntries(makeManifest({ onProvision: './dist/on-provision.js#default' }));
    const backend = { execute: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    expect(result.onProvisionCalled).toBe(true);
    expect(backend.execute).toHaveBeenCalledOnce();
    expect(backend.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        handlerRef: './dist/on-provision.js#default',
        pluginRoot: PLUGIN_ROOT,
        input: expect.objectContaining({
          secret: result.secret,
          url: result.url,
        }),
      }),
    );
  });

  it('onProvision failure logs error and does not throw', async () => {
    const manifests = makeManifestEntries(makeManifest({ onProvision: './dist/on-provision.js#default' }));
    const backend = { execute: vi.fn().mockRejectedValue(new Error('handler unavailable')) };

    const result = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    expect(result.onProvisionCalled).toBe(false);
    expect(noopLogger.error).toHaveBeenCalled();
    // Secret is still provisioned
    const entry = await store.get(NS, PLUGIN_ID, EVENT);
    expect(entry).not.toBeNull();
  });

  it('includes instanceId in url and secret store for multi: true', async () => {
    const manifests = makeManifestEntries(makeManifest({ multi: true }));
    const backend = { execute: vi.fn() };
    const INSTANCE = 'tenant-xyz';

    const result = await provisionWebhook(
      { namespaceId: NS, pluginId: PLUGIN_ID, event: EVENT, instanceId: INSTANCE, baseUrl: BASE_URL },
      store,
      backend as never,
      manifests,
      noopLogger,
    );

    expect(result.url).toBe(`${BASE_URL}/webhooks/${PLUGIN_ID}/${EVENT}/${INSTANCE}`);
    const entry = await store.get(NS, PLUGIN_ID, EVENT, INSTANCE);
    expect(entry).not.toBeNull();
    expect(entry!.current).toBe(result.secret);
  });

  it('throws if pluginId+event combination not found in manifests', async () => {
    const manifests = makeManifestEntries(makeManifest());
    const backend = { execute: vi.fn() };

    await expect(
      provisionWebhook(
        { namespaceId: NS, pluginId: PLUGIN_ID, event: 'nonexistent-event', baseUrl: BASE_URL },
        store,
        backend as never,
        manifests,
        noopLogger,
      ),
    ).rejects.toThrow("webhook 'test-plugin/nonexistent-event' not found");
  });
});
