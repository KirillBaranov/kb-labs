/**
 * @module cli-commands/__tests__/auth-register
 *
 * `kb auth register` calls POST /auth/register, which the gateway gates
 * behind the MACHINE_REGISTER permission — only a human session
 * (~/.kb/session.json) actually carries it (see
 * services/gateway/auth/src/stub-pdp.ts); a machine credential
 * (~/.kb/credentials.json) only works if it happens to have the permission
 * embedded. The command tries the session store first, falling back to the
 * machine credentials store only when no session exists.
 *
 * Renamed from create-service-account (auth-create-service-account.ts) —
 * the three-word name was inconsistent with sibling `auth` commands
 * (login/logout/status).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noopUI, noopTraceContext } from '@kb-labs/plugin-contracts';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

const mockCredLoad = vi.fn();
const mockCredIsExpired = vi.fn();
const mockCredRefresh = vi.fn();
const mockSessionLoad = vi.fn();
const mockSessionIsExpired = vi.fn();
const mockSessionRefresh = vi.fn();
vi.mock('@kb-labs/cli-runtime/gateway', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({
    load: mockCredLoad,
    isExpired: mockCredIsExpired,
    refresh: mockCredRefresh,
  })),
  SessionManager: vi.fn().mockImplementation(() => ({
    load: mockSessionLoad,
    isExpired: mockSessionIsExpired,
    refresh: mockSessionRefresh,
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { authRegister } from '../commands/system/auth/auth-register.js';

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function makeCtx(captured: { errors: string[]; output: string[]; json: unknown[] }): PluginContextV3 {
  return {
    host: 'cli',
    requestId: 'test',
    pluginId: '@kb-labs/system',
    pluginVersion: '1.0.0',
    cwd: process.cwd(),
    ui: {
      ...noopUI,
      write: (msg: string) => { captured.output.push(msg); },
      error: (msg: string) => { captured.errors.push(msg); },
      json: (obj: unknown) => { captured.json.push(obj); },
    },
    platform: {
      logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis() },
      llm: {} as any, embeddings: {} as any, vectorStore: {} as any,
      cache: {} as any, storage: {} as any, analytics: {} as any,
      eventBus: { publish: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) },
      logs: {} as any,
    } as any,
    runtime: { fs: {} as any, fetch: vi.fn(), env: vi.fn() },
    api: {} as any,
    hostContext: { host: 'cli' as const, argv: [], flags: {} },
    trace: noopTraceContext,
  };
}

const FLAGS = {
  'gateway-url': 'http://localhost:4000',
  name: 'my-agent',
  'namespace-id': 'default',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no session — most cases exercise the machine-credential fallback
  // unless a case explicitly sets up a session.
  mockSessionLoad.mockResolvedValue(null);
});

describe('kb auth register', () => {
  it('REG-01: no session — falls back to stored machine credentials as Bearer', async () => {
    mockCredLoad.mockResolvedValueOnce({ accessToken: 'admin-tok', refreshToken: 'r', expiresAt: Date.now() + 60_000, gatewayUrl: 'http://localhost:4000' });
    mockCredIsExpired.mockReturnValueOnce(false);
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ clientId: 'c_1', clientSecret: 's_1', hostId: 'h_1' }));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/register',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-tok' }),
      }),
    );
  });

  it('REG-02: no session, no machine credentials — fails fast without calling fetch', async () => {
    mockCredLoad.mockResolvedValueOnce(null);

    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(captured.errors.some(e => e.includes('kb auth login'))).toBe(true);
  });

  it('REG-03: expired machine credentials are refreshed before the request', async () => {
    mockCredLoad.mockResolvedValueOnce({ accessToken: 'stale', refreshToken: 'r', expiresAt: Date.now() - 1, gatewayUrl: 'http://localhost:4000' });
    mockCredIsExpired.mockReturnValueOnce(true);
    mockCredRefresh.mockResolvedValueOnce({ accessToken: 'fresh-tok', refreshToken: 'r2', expiresAt: Date.now() + 60_000, gatewayUrl: 'http://localhost:4000' });
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ clientId: 'c_1', clientSecret: 's_1', hostId: 'h_1' }));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(0);
    expect(mockCredRefresh).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/register',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-tok' }),
      }),
    );
  });

  it('REG-04: gateway 403 surfaces the not-self-service hint', async () => {
    mockCredLoad.mockResolvedValueOnce({ accessToken: 'admin-tok', refreshToken: 'r', expiresAt: Date.now() + 60_000, gatewayUrl: 'http://localhost:4000' });
    mockCredIsExpired.mockReturnValueOnce(false);
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Forbidden' }, 403));

    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(1);
    expect(captured.errors.some(e => e.includes('not self-service'))).toBe(true);
  });

  it('REG-05: a valid session is preferred over machine credentials', async () => {
    mockSessionLoad.mockResolvedValueOnce({ accessToken: 'session-tok', refreshToken: 'r', expiresAt: Date.now() + 60_000, gatewayUrl: 'http://localhost:4000' });
    mockSessionIsExpired.mockReturnValueOnce(false);
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ clientId: 'c_1', clientSecret: 's_1', hostId: 'h_1' }));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/register',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-tok' }),
      }),
    );
    // Machine credentials store must not even be consulted when a session exists.
    expect(mockCredLoad).not.toHaveBeenCalled();
  });

  it('REG-06: an expired session is refreshed via /auth/refresh/cli before the request', async () => {
    mockSessionLoad.mockResolvedValueOnce({ accessToken: 'stale', refreshToken: 'r', expiresAt: Date.now() - 1, gatewayUrl: 'http://localhost:4000' });
    mockSessionIsExpired.mockReturnValueOnce(true);
    mockSessionRefresh.mockResolvedValueOnce({ accessToken: 'fresh-session-tok', refreshToken: 'r2', expiresAt: Date.now() + 60_000, gatewayUrl: 'http://localhost:4000' });
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ clientId: 'c_1', clientSecret: 's_1', hostId: 'h_1' }));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(0);
    expect(mockSessionRefresh).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/register',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-session-tok' }),
      }),
    );
  });

  it('REG-07: session refresh failure surfaces an error and never falls back to machine credentials', async () => {
    mockSessionLoad.mockResolvedValueOnce({ accessToken: 'stale', refreshToken: 'r', expiresAt: Date.now() - 1, gatewayUrl: 'http://localhost:4000' });
    mockSessionIsExpired.mockReturnValueOnce(true);
    mockSessionRefresh.mockRejectedValueOnce(new Error('refresh 401'));

    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authRegister.run(ctx, [], FLAGS);

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCredLoad).not.toHaveBeenCalled();
    expect(captured.errors.some(e => e.includes('kb auth login --email/--password'))).toBe(true);
  });
});
