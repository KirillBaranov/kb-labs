/**
 * Security tests for gateway server (H11 + H12).
 * H11: JWT tokens in ?access_token= query param must be redacted from access logs.
 * H12: CORS must not reflect arbitrary origins (origin: false).
 *
 * redactQueryToken is private — tested via integration by checking that
 * Fastify logger messages do not contain raw tokens when access_token is in URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import { createServer } from '../server.js';

// ── Minimal stubs ──────────────────────────────────────────────────────────────

function makeCache(): ICache {
  const store = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async clear() { store.clear(); },
  } as unknown as ICache;
}

const logMessages: Array<{ msg: string; meta: unknown }> = [];
function makeLogger(): ILogger {
  const log = (msg: string, meta?: unknown) => logMessages.push({ msg, meta });
  const child = () => ({
    info: log, warn: log, error: log, debug: log, trace: log, fatal: log, child: () => makeLogger(),
  });
  return { info: log, warn: log, error: log, debug: log, trace: log, fatal: log, child } as unknown as ILogger;
}

const minimalConfig = {
  port: 4099,
  upstreams: {},
  staticTokens: {},
};

const jwtConfig = { secret: 'test-secret-at-least-32-chars-long!' };

// ── Test setup ─────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  const logger = makeLogger();
  const cache = makeCache();
  app = await createServer(minimalConfig as any, cache, logger, jwtConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ── H11: JWT not logged ────────────────────────────────────────────────────────

describe('H11 — access_token query param redacted from logs', () => {
  it('does not log a raw JWT token present in ?access_token= query string', async () => {
    logMessages.length = 0;
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fakeSig';

    await app.inject({
      method: 'GET',
      url: `/health?access_token=${fakeToken}`,
    });

    // No log message should contain the raw token
    const rawTokenInLogs = logMessages.some(({ msg }) => {
      const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
      return msgStr.includes(fakeToken);
    });
    expect(rawTokenInLogs).toBe(false);
  });

  it('logs [REDACTED] in place of the token value', async () => {
    logMessages.length = 0;
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.fakeSig';

    await app.inject({
      method: 'GET',
      url: `/health?access_token=${fakeToken}`,
    });

    const hasRedacted = logMessages.some(({ msg }) => {
      const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
      return msgStr.includes('[REDACTED]');
    });
    expect(hasRedacted).toBe(true);
  });

  it('logs other query params normally (only access_token is redacted)', async () => {
    logMessages.length = 0;

    await app.inject({
      method: 'GET',
      url: '/health?foo=bar&baz=qux',
    });

    const hasOtherParams = logMessages.some(({ msg }) => {
      const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
      return msgStr.includes('foo=bar');
    });
    expect(hasOtherParams).toBe(true);
  });
});

// ── H12: CORS not wildcard ─────────────────────────────────────────────────────

describe('H12 — CORS does not reflect arbitrary origin', () => {
  it('does not echo back a random attacker origin in CORS header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { Origin: 'https://attacker.evil.com' },
    });

    const corsHeader = res.headers['access-control-allow-origin'];
    expect(corsHeader).not.toBe('https://attacker.evil.com');
  });
});
