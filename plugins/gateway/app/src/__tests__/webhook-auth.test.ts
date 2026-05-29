/**
 * Unit tests for verifyWebhookAuth.
 *
 * Covers all three auth strategies (secret, hmac, custom) including
 * previous-secret grace window and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { InMemoryCache } from '@kb-labs/core-platform/inmemory';
import { WebhookSecretStore } from '../webhook/secret-store.js';
import { verifyWebhookAuth } from '../webhook/auth.js';
import type { WebhookAuthConfig } from '@kb-labs/plugin-contracts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBody(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload));
}

function hmacSig(body: Buffer, secret: string, prefix = ''): string {
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return `${prefix}${sig}`;
}

const NS = 'ns-test';
const PLUGIN = '@kb-labs/plugin';
const EVENT = 'alert';

const baseReq = {
  namespaceId: NS,
  pluginId: PLUGIN,
  event: EVENT,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('verifyWebhookAuth — secret', () => {
  const authConfig: WebhookAuthConfig = { type: 'secret', header: 'X-Webhook-Secret' };
  let store: WebhookSecretStore;
  const rawBody = makeBody({ action: 'ping' });

  beforeEach(async () => {
    const cache = new InMemoryCache();
    store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN, EVENT, { current: 'valid-secret-abc' });
  });

  it('valid current secret → { valid: true }', async () => {
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-webhook-secret': 'valid-secret-abc' },
    }, store);
    expect(result).toEqual({ valid: true });
  });

  it('wrong secret → { valid: false }', async () => {
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-webhook-secret': 'wrong-secret' },
    }, store);
    expect(result.valid).toBe(false);
  });

  it('missing header → { valid: false }', async () => {
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, store);
    expect(result.valid).toBe(false);
  });

  it('valid previous secret (not expired) → { valid: true }', async () => {
    await store.set(NS, PLUGIN, EVENT, {
      current: 'new-secret',
      previous: 'old-secret',
      previousExpiresAt: Date.now() + 3_600_000, // 1h from now
    });
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-webhook-secret': 'old-secret' },
    }, store);
    expect(result).toEqual({ valid: true });
  });

  it('expired previous secret → { valid: false }', async () => {
    await store.set(NS, PLUGIN, EVENT, {
      current: 'new-secret',
      previous: 'old-secret',
      previousExpiresAt: Date.now() - 1000, // expired 1s ago
    });
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-webhook-secret': 'old-secret' },
    }, store);
    expect(result.valid).toBe(false);
  });

  it('no secret entry in store → { valid: false, reason: "not provisioned" }', async () => {
    const emptyStore = new WebhookSecretStore(new InMemoryCache());
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-webhook-secret': 'any' },
    }, emptyStore);
    expect(result).toEqual({ valid: false, reason: 'not provisioned' });
  });
});

describe('verifyWebhookAuth — hmac', () => {
  const authConfig: WebhookAuthConfig = {
    type: 'hmac',
    header: 'X-Hub-Signature-256',
    prefix: 'sha256=',
  };
  let store: WebhookSecretStore;
  const rawBody = makeBody({ ref: 'refs/heads/main' });

  beforeEach(async () => {
    const cache = new InMemoryCache();
    store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN, EVENT, { current: 'hmac-secret' });
  });

  it('valid HMAC → { valid: true }', async () => {
    const sig = hmacSig(rawBody, 'hmac-secret', 'sha256=');
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-hub-signature-256': sig },
    }, store);
    expect(result).toEqual({ valid: true });
  });

  it('tampered body → { valid: false }', async () => {
    const sig = hmacSig(rawBody, 'hmac-secret', 'sha256=');
    const tamperedBody = Buffer.from('{"ref":"tampered"}');
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody: tamperedBody, headers: { 'x-hub-signature-256': sig },
    }, store);
    expect(result.valid).toBe(false);
  });

  it('wrong signing key → { valid: false }', async () => {
    const sig = hmacSig(rawBody, 'wrong-key', 'sha256=');
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-hub-signature-256': sig },
    }, store);
    expect(result.valid).toBe(false);
  });

  it('strips prefix correctly (no prefix config)', async () => {
    const authNoPrefix: WebhookAuthConfig = { type: 'hmac', header: 'X-Signature' };
    await store.set(NS, PLUGIN, EVENT, { current: 'hmac-secret' });
    const sig = hmacSig(rawBody, 'hmac-secret'); // no prefix
    const result = await verifyWebhookAuth(authNoPrefix, {
      ...baseReq, rawBody, headers: { 'x-signature': sig },
    }, store);
    expect(result).toEqual({ valid: true });
  });

  it('valid previous HMAC secret (not expired) → { valid: true }', async () => {
    await store.set(NS, PLUGIN, EVENT, {
      current: 'new-key',
      previous: 'old-key',
      previousExpiresAt: Date.now() + 3_600_000,
    });
    const sig = hmacSig(rawBody, 'old-key', 'sha256=');
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: { 'x-hub-signature-256': sig },
    }, store);
    expect(result).toEqual({ valid: true });
  });
});

describe('verifyWebhookAuth — custom', () => {
  const authConfig: WebhookAuthConfig = {
    type: 'custom',
    validator: './dist/webhooks/stripe-validate.js#default',
  };
  let store: WebhookSecretStore;
  const rawBody = makeBody({ type: 'payment_intent.succeeded' });

  beforeEach(async () => {
    const cache = new InMemoryCache();
    store = new WebhookSecretStore(cache);
    await store.set(NS, PLUGIN, EVENT, { current: 'stripe-secret' });
  });

  it('validator returns { valid: true } → { valid: true }', async () => {
    const backend = { execute: vi.fn().mockResolvedValue({ valid: true }) } as any;
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, store, backend, '/plugins/payment');
    expect(result).toEqual({ valid: true });
  });

  it('validator returns { valid: false } → { valid: false }', async () => {
    const backend = { execute: vi.fn().mockResolvedValue({ valid: false }) } as any;
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, store, backend, '/plugins/payment');
    expect(result.valid).toBe(false);
  });

  it('validator throws → { valid: false, reason: "validator error" }', async () => {
    const backend = { execute: vi.fn().mockRejectedValue(new Error('timeout')) } as any;
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, store, backend, '/plugins/payment');
    expect(result).toEqual({ valid: false, reason: 'validator error' });
  });

  it('no secret entry → { valid: false, reason: "not provisioned" }', async () => {
    const emptyStore = new WebhookSecretStore(new InMemoryCache());
    const backend = { execute: vi.fn() } as any;
    const result = await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, emptyStore, backend, '/plugins/payment');
    expect(result).toEqual({ valid: false, reason: 'not provisioned' });
    expect(backend.execute).not.toHaveBeenCalled();
  });

  it('validator receives bodyHmac (not plaintext secret) to prevent secret exposure', async () => {
    const backend = { execute: vi.fn().mockResolvedValue({ valid: true }) } as any;
    await verifyWebhookAuth(authConfig, {
      ...baseReq, rawBody, headers: {},
    }, store, backend, '/plugins/payment');

    expect(backend.execute).toHaveBeenCalledOnce();
    const callInput = backend.execute.mock.calls[0][0].input as Record<string, unknown>;
    // Must NOT expose plaintext secret
    expect(callInput).not.toHaveProperty('secret');
    // Must pass bodyHmac so the validator can verify without knowing the secret
    expect(callInput).toHaveProperty('bodyHmac');
    expect(typeof callInput.bodyHmac).toBe('string');
    expect(callInput.bodyHmac).toHaveLength(64); // hex-encoded SHA-256
  });
});
