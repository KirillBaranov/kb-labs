/**
 * @module cli-commands/__tests__/auth-status
 *
 * `kb auth status` reports both identity stores — machine credentials and
 * human session — so a caller with only one doesn't get a half-true picture.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noopUI, noopTraceContext } from '@kb-labs/plugin-contracts';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

const mockCredLoad = vi.fn();
const mockCredIsExpired = vi.fn();
const mockSessionLoad = vi.fn();
const mockSessionIsExpired = vi.fn();
vi.mock('@kb-labs/cli-runtime/gateway', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({ load: mockCredLoad, isExpired: mockCredIsExpired })),
  SessionManager: vi.fn().mockImplementation(() => ({ load: mockSessionLoad, isExpired: mockSessionIsExpired })),
}));

import { authStatus } from '../commands/system/auth/auth-status.js';

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kb auth status', () => {
  it('ST-01: neither store — authenticated false, session.authenticated false', async () => {
    mockCredLoad.mockResolvedValueOnce(null);
    mockSessionLoad.mockResolvedValueOnce(null);

    const captured = { errors: [], output: [], json: [] };
    const exitCode = await authStatus.run(makeCtx(captured), [], { json: true });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ authenticated: false, session: { authenticated: false } });
  });

  it('ST-02: machine only — top-level authenticated true, session.authenticated false', async () => {
    mockCredLoad.mockResolvedValueOnce({ gatewayUrl: 'http://localhost:4000', accessToken: 'a', expiresAt: Date.now() + 60_000 });
    mockCredIsExpired.mockReturnValueOnce(false);
    mockSessionLoad.mockResolvedValueOnce(null);

    const captured = { errors: [], output: [], json: [] };
    const exitCode = await authStatus.run(makeCtx(captured), [], { json: true });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({
      authenticated: true,
      gatewayUrl: 'http://localhost:4000',
      session: { authenticated: false },
    });
  });

  it('ST-03: session only — top-level authenticated false, session reports its own status', async () => {
    mockCredLoad.mockResolvedValueOnce(null);
    mockSessionLoad.mockResolvedValueOnce({ gatewayUrl: 'http://localhost:4000', accessToken: 'b', expiresAt: Date.now() + 60_000, email: 'admin@bootstrap.local' });
    mockSessionIsExpired.mockReturnValueOnce(false);

    const captured = { errors: [], output: [], json: [] };
    const exitCode = await authStatus.run(makeCtx(captured), [], { json: true });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({
      authenticated: false,
      session: { authenticated: true, email: 'admin@bootstrap.local', tokenExpired: false },
    });
  });

  it('ST-04: both stores present — both reported', async () => {
    mockCredLoad.mockResolvedValueOnce({ gatewayUrl: 'http://localhost:4000', accessToken: 'a', expiresAt: Date.now() + 60_000 });
    mockCredIsExpired.mockReturnValueOnce(false);
    mockSessionLoad.mockResolvedValueOnce({ gatewayUrl: 'http://localhost:4000', accessToken: 'b', expiresAt: Date.now() - 1, email: 'admin@bootstrap.local' });
    mockSessionIsExpired.mockReturnValueOnce(true);

    const captured = { errors: [], output: [], json: [] };
    const exitCode = await authStatus.run(makeCtx(captured), [], { json: true });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({
      authenticated: true,
      session: { authenticated: true, tokenExpired: true },
    });
  });
});
