/**
 * @module cli-commands/__tests__/auth-login
 *
 * Unit tests for `kb auth login` command.
 * Verifies token exchange, /auth/me profile fetch, and credentials persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noopUI, noopTraceContext } from '@kb-labs/plugin-contracts';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

// Mock CredentialsManager / SessionManager — avoid touching ~/.kb/*.json
const mockSave = vi.fn();
const mockSessionSave = vi.fn();
vi.mock('@kb-labs/cli-runtime/gateway', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({ save: mockSave })),
  SessionManager: vi.fn().mockImplementation(() => ({ save: mockSessionSave })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { authLogin } from '../commands/system/auth/auth-login.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_RESPONSE = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresIn: 900,
};

const ME_RESPONSE = {
  handle: 'kirill',
  namespaceId: 'ns_abc',
};

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

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kb auth login', () => {
  it('AL-01: successful login saves accessToken, handle and namespaceId', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(TOKEN_RESPONSE))   // POST /auth/token
      .mockResolvedValueOnce(makeJsonResponse(ME_RESPONSE));      // GET /auth/me

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
    });

    expect(exitCode).toBe(0);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'http://localhost:4000',
        accessToken: 'access-tok',
        refreshToken: 'refresh-tok',
        handle: 'kirill',
        namespaceId: 'ns_abc',
      }),
    );
  });

  it('AL-02: /auth/me failure is non-fatal — credentials saved without handle', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(TOKEN_RESPONSE))   // POST /auth/token
      .mockRejectedValueOnce(new Error('network error'));         // GET /auth/me — fails

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
    });

    expect(exitCode).toBe(0);
    // credentials saved — but handle is undefined (not set)
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-tok' }),
    );
    const saved = mockSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved.handle).toBeUndefined();
  });

  it('AL-03: missing flags — exitCode 1, no fetch calls', async () => {
    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      // missing client-id and client-secret
    });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('AL-04: gateway unreachable — exitCode 1, error shown', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
    });

    expect(exitCode).toBe(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('AL-05: token endpoint returns 401 — exitCode 1', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Unauthorized' }, 401));

    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
    });

    expect(exitCode).toBe(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(captured.errors.some(e => e.includes('401'))).toBe(true);
  });

  it('AL-06: --json flag outputs structured result', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(makeJsonResponse(ME_RESPONSE));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
      json: true,
    });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({
      ok: true,
      gatewayUrl: 'http://localhost:4000',
      handle: 'kirill',
    });
    expect(captured.output.length).toBe(0);
  });

  it('AL-07: expiresAt is in the future (based on expiresIn)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(TOKEN_RESPONSE))
      .mockResolvedValueOnce(makeJsonResponse(ME_RESPONSE));

    const before = Date.now();
    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);
    await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      'client-id': 'clt_test',
      'client-secret': 'cs_test',
    });

    const saved = mockSave.mock.calls[0]?.[0] as Record<string, number>;
    const expectedMin = before + TOKEN_RESPONSE.expiresIn * 1000;
    expect(saved.expiresAt).toBeGreaterThanOrEqual(expectedMin);
  });

  // ── human (email/password) branch ─────────────────────────────────────────

  const CLI_LOGIN_RESPONSE = {
    accessToken: 'session-access-tok',
    refreshToken: 'session-refresh-tok',
    expiresIn: 900,
    tenantId: 'default',
  };

  const ME_HUMAN_RESPONSE = {
    userId: 'user_1',
    email: 'admin@bootstrap.local',
    tenantId: 'default',
  };

  it('AL-08: --email/--password hits /auth/login/cli and saves via SessionManager', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(CLI_LOGIN_RESPONSE))   // POST /auth/login/cli
      .mockResolvedValueOnce(makeJsonResponse(ME_HUMAN_RESPONSE));    // GET /auth/me

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      email: 'admin@bootstrap.local',
      password: 'AdminPass123!',
    });

    expect(exitCode).toBe(0);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:4000/auth/login/cli', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'admin@bootstrap.local', password: 'AdminPass123!' }),
    }));
    expect(mockSessionSave).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'http://localhost:4000',
        accessToken: 'session-access-tok',
        refreshToken: 'session-refresh-tok',
        email: 'admin@bootstrap.local',
        tenantId: 'default',
      }),
    );
    // Machine store must never be touched by the human branch.
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('AL-09: --email/--password wrong password — exitCode 1, no session saved', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'invalid_credentials' }, 401));

    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      email: 'admin@bootstrap.local',
      password: 'wrong',
    });

    expect(exitCode).toBe(1);
    expect(mockSessionSave).not.toHaveBeenCalled();
    expect(captured.errors.some(e => e.includes('401'))).toBe(true);
  });

  it('AL-10: neither client-id/secret nor email/password — exitCode 1, no fetch calls', async () => {
    const captured: { errors: string[]; output: string[]; json: unknown[] } = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
    });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('AL-11: /auth/me failure on human branch is non-fatal — session saved without resolved profile', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(CLI_LOGIN_RESPONSE))
      .mockRejectedValueOnce(new Error('network error'));

    const captured = { errors: [], output: [], json: [] };
    const ctx = makeCtx(captured);

    const exitCode = await authLogin.run(ctx, [], {
      'gateway-url': 'http://localhost:4000',
      email: 'admin@bootstrap.local',
      password: 'AdminPass123!',
    });

    expect(exitCode).toBe(0);
    // Falls back to the email flag itself and the tenantId from /auth/login/cli.
    expect(mockSessionSave).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@bootstrap.local', tenantId: 'default' }),
    );
  });
});
