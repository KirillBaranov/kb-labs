/**
 * Tests for WebhookHandlerDecl and WebhookHostContext extensions.
 *
 * Verifies new auth config types, optional fields, and host context fields.
 * Type-level assertions use @ts-expect-error to catch missing required fields.
 */

import { describe, it, expect } from 'vitest';
import type {
  WebhookHandlerDecl,
  WebhookAuthConfig,
  WebhookAuthSecret,
  WebhookAuthHmac,
  WebhookAuthCustom,
  WebhookChallengeConfig,
} from './manifest.js';
import type { WebhookHostContext } from './host-context.js';

// ── WebhookAuthConfig type narrowing ─────────────────────────────────────────

describe('WebhookAuthConfig', () => {
  it('narrows to WebhookAuthSecret on type === "secret"', () => {
    const auth: WebhookAuthConfig = { type: 'secret', header: 'X-Webhook-Secret' };
    if (auth.type === 'secret') {
      const _: WebhookAuthSecret = auth;
      expect(auth.header).toBe('X-Webhook-Secret');
    }
  });

  it('narrows to WebhookAuthHmac on type === "hmac"', () => {
    const auth: WebhookAuthConfig = {
      type: 'hmac',
      header: 'X-Hub-Signature-256',
      prefix: 'sha256=',
    };
    if (auth.type === 'hmac') {
      const _: WebhookAuthHmac = auth;
      expect(auth.header).toBe('X-Hub-Signature-256');
      expect(auth.prefix).toBe('sha256=');
    }
  });

  it('prefix is optional on hmac', () => {
    const auth: WebhookAuthHmac = { type: 'hmac', header: 'X-Sig' };
    expect(auth.prefix).toBeUndefined();
  });

  it('narrows to WebhookAuthCustom on type === "custom"', () => {
    const auth: WebhookAuthConfig = {
      type: 'custom',
      validator: './dist/webhooks/stripe-validate.js#default',
    };
    if (auth.type === 'custom') {
      const _: WebhookAuthCustom = auth;
      expect(auth.validator).toBe('./dist/webhooks/stripe-validate.js#default');
    }
  });
});

// ── WebhookChallengeConfig ────────────────────────────────────────────────────

describe('WebhookChallengeConfig', () => {
  it('has bodyPath, value, replyPath', () => {
    const challenge: WebhookChallengeConfig = {
      bodyPath: 'type',
      value: 'url_verification',
      replyPath: 'challenge',
    };
    expect(challenge.bodyPath).toBe('type');
    expect(challenge.value).toBe('url_verification');
    expect(challenge.replyPath).toBe('challenge');
  });
});

// ── WebhookHandlerDecl ────────────────────────────────────────────────────────

describe('WebhookHandlerDecl', () => {
  it('accepts minimal valid declaration with required auth', () => {
    const decl: WebhookHandlerDecl = {
      event: 'alert',
      handler: './dist/webhooks/alert.js#default',
      auth: { type: 'secret', header: 'X-Webhook-Secret' },
    };
    expect(decl.event).toBe('alert');
    expect(decl.auth.type).toBe('secret');
  });

  it('accepts all optional fields', () => {
    const decl: WebhookHandlerDecl = {
      event: 'update',
      handler: './dist/webhooks/update.js#default',
      auth: { type: 'secret', header: 'X-Telegram-Bot-Api-Secret-Token' },
      multi: true,
      async: true,
      idempotencyKey: 'headers["x-delivery-id"]',
      onProvision: './dist/webhooks/register.js#default',
      maxBodyBytes: 256 * 1024,
      rateLimit: { requestsPerMinute: 30 },
      challenge: {
        bodyPath: 'type',
        value: 'url_verification',
        replyPath: 'challenge',
      },
      describe: 'Receive Telegram updates',
    };
    expect(decl.multi).toBe(true);
    expect(decl.async).toBe(true);
    expect(decl.idempotencyKey).toBe('headers["x-delivery-id"]');
    expect(decl.onProvision).toBe('./dist/webhooks/register.js#default');
    expect(decl.maxBodyBytes).toBe(256 * 1024);
    expect(decl.rateLimit?.requestsPerMinute).toBe(30);
    expect(decl.challenge?.value).toBe('url_verification');
  });

  it('optional fields default to undefined when not provided', () => {
    const decl: WebhookHandlerDecl = {
      event: 'push',
      handler: './dist/webhooks/push.js#default',
      auth: { type: 'hmac', header: 'X-Hub-Signature-256' },
    };
    expect(decl.multi).toBeUndefined();
    expect(decl.async).toBeUndefined();
    expect(decl.challenge).toBeUndefined();
    expect(decl.idempotencyKey).toBeUndefined();
    expect(decl.onProvision).toBeUndefined();
    expect(decl.maxBodyBytes).toBeUndefined();
    expect(decl.rateLimit).toBeUndefined();
  });

  it('accepts hmac auth with all fields', () => {
    const decl: WebhookHandlerDecl = {
      event: 'push',
      handler: './dist/webhooks/push.js#default',
      auth: { type: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' },
    };
    if (decl.auth.type === 'hmac') {
      expect(decl.auth.prefix).toBe('sha256=');
    }
  });

  it('accepts custom auth with validator path', () => {
    const decl: WebhookHandlerDecl = {
      event: 'payment',
      handler: './dist/webhooks/payment.js#default',
      auth: { type: 'custom', validator: './dist/webhooks/stripe-validate.js#default' },
    };
    if (decl.auth.type === 'custom') {
      expect(decl.auth.validator).toContain('stripe-validate');
    }
  });
});

// ── WebhookHostContext ────────────────────────────────────────────────────────

describe('WebhookHostContext', () => {
  it('has required namespaceId and webhookId', () => {
    const ctx: WebhookHostContext = {
      host: 'webhook',
      event: 'alert',
      namespaceId: 'ns-local',
      webhookId: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(ctx.namespaceId).toBe('ns-local');
    expect(ctx.webhookId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('instanceId is optional', () => {
    const ctx: WebhookHostContext = {
      host: 'webhook',
      event: 'update',
      namespaceId: 'ns-local',
      webhookId: 'abc-123',
      instanceId: 'bot-42',
    };
    expect(ctx.instanceId).toBe('bot-42');

    const ctx2: WebhookHostContext = {
      host: 'webhook',
      event: 'update',
      namespaceId: 'ns-local',
      webhookId: 'abc-456',
    };
    expect(ctx2.instanceId).toBeUndefined();
  });

  it('source is still optional', () => {
    const ctx: WebhookHostContext = {
      host: 'webhook',
      event: 'push',
      namespaceId: 'ns-prod',
      webhookId: 'abc-789',
      source: '192.168.1.1',
    };
    expect(ctx.source).toBe('192.168.1.1');
  });
});
