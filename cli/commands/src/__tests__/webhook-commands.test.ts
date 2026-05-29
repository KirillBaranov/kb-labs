/**
 * @module cli-commands/__tests__/webhook-commands
 *
 * Unit tests for `kb webhook provision`, `kb webhook list`, `kb webhook revoke`.
 * Mocks CredentialsManager and fetch — no real HTTP or file system access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noopUI, noopTraceContext } from '@kb-labs/plugin-contracts';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

// ── mocks ─────────────────────────────────────────────────────────────────────

const CREDS = {
  gatewayUrl: 'http://localhost:4000',
  accessToken: 'tok_test',
  refreshToken: 'ref_test',
  expiresAt: Date.now() + 900_000,
};

const mockLoad = vi.fn();
vi.mock('@kb-labs/cli-runtime/gateway', () => ({
  CredentialsManager: vi.fn().mockImplementation(() => ({ load: mockLoad })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { webhookProvision } from '../commands/system/webhook/webhook-provision.js';
import { webhookList } from '../commands/system/webhook/webhook-list.js';
import { webhookRevoke } from '../commands/system/webhook/webhook-revoke.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function makeEmptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

type Captured = { errors: string[]; output: string[]; json: unknown[] };

function makeCtx(captured: Captured): PluginContextV3 {
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
      logger: {
        trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(),
        error: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(),
      },
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
  mockLoad.mockResolvedValue(CREDS);
});

// ── webhook provision ─────────────────────────────────────────────────────────

describe('kb webhook provision', () => {
  it('WP-01: provisions successfully — prints URL and secret', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({
      url: 'http://localhost:4000/webhooks/@kb-labs/rollout/alert',
      secret: 'abc123',
      rotated: false,
    }));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(0);
    expect(captured.output.join('')).toContain('abc123');
    expect(captured.output.join('')).toContain('http://localhost:4000/webhooks/@kb-labs/rollout/alert');
  });

  it('WP-02: rotation — prints rotation notice', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({
      url: 'http://localhost:4000/webhooks/@kb-labs/rollout/alert',
      secret: 'new_secret_xyz',
      rotated: true,
    }));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(0);
    const out = captured.output.join('');
    expect(out).toContain('rotated');
    expect(out).toContain('new_secret_xyz');
  });

  it('WP-03: --instance flag passed in body', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({
      url: 'http://localhost:4000/webhooks/@kb-labs/rollout/alert/prod',
      secret: 'inst_secret',
      rotated: false,
    }));

    const captured: Captured = { errors: [], output: [], json: [] };
    await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
      instance: 'prod',
    });

    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body.instanceId).toBe('prod');
  });

  it('WP-04: --json outputs structured result', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({
      url: 'http://localhost:4000/webhooks/@kb-labs/rollout/alert',
      secret: 'json_secret',
      rotated: false,
    }));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
      json: true,
    });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, secret: 'json_secret', rotated: false });
    expect(captured.output.length).toBe(0);
  });

  it('WP-05: missing --plugin → exitCode 1, no fetch', async () => {
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], { event: 'alert' });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('WP-06: missing --event → exitCode 1, no fetch', async () => {
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], { plugin: '@kb-labs/rollout' });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('WP-07: not authenticated → exitCode 1', async () => {
    mockLoad.mockResolvedValue(null);
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('WP-08: gateway returns 404 → exitCode 1 with error', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Not Found', message: "webhook 'x/y' not found" }, 404));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: 'x',
      event: 'y',
    });

    expect(exitCode).toBe(1);
    expect(captured.errors.join('')).toContain('404');
  });

  it('WP-09: network error → exitCode 1', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookProvision.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(1);
    expect(captured.errors.join('')).toContain('ECONNREFUSED');
  });
});

// ── webhook list ──────────────────────────────────────────────────────────────

describe('kb webhook list', () => {
  const WEBHOOKS = [
    { pluginId: '@kb-labs/rollout', event: 'alert', multi: false, provisioned: true },
    { pluginId: '@kb-labs/rollout', event: 'deploy', multi: true, provisioned: false },
  ];

  it('WL-01: lists webhooks in table format', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ webhooks: WEBHOOKS }));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookList.run(makeCtx(captured), [], {});

    expect(exitCode).toBe(0);
    const out = captured.output.join('');
    expect(out).toContain('@kb-labs/rollout');
    expect(out).toContain('alert');
    expect(out).toContain('deploy');
  });

  it('WL-02: --plugin filter passed in query string', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ webhooks: [] }));

    const captured: Captured = { errors: [], output: [], json: [] };
    await webhookList.run(makeCtx(captured), [], { plugin: '@kb-labs/rollout' });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('pluginId=');
    expect(decodeURIComponent(url)).toContain('@kb-labs/rollout');
  });

  it('WL-03: --json outputs structured list', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ webhooks: WEBHOOKS }));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookList.run(makeCtx(captured), [], { json: true });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, webhooks: WEBHOOKS });
    expect(captured.output.length).toBe(0);
  });

  it('WL-04: empty list shows "No webhook endpoints found"', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ webhooks: [] }));

    const captured: Captured = { errors: [], output: [], json: [] };
    await webhookList.run(makeCtx(captured), [], {});

    expect(captured.output.join('')).toContain('No webhook endpoints found');
  });

  it('WL-05: not authenticated → exitCode 1', async () => {
    mockLoad.mockResolvedValue(null);
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookList.run(makeCtx(captured), [], {});

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('WL-06: Authorization header sent', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ webhooks: [] }));

    await webhookList.run(makeCtx({ errors: [], output: [], json: [] }), [], {});

    const opts = mockFetch.mock.calls[0]![1] as RequestInit;
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok_test');
  });
});

// ── webhook revoke ────────────────────────────────────────────────────────────

describe('kb webhook revoke', () => {
  it('WR-01: revoke sends DELETE and reports success', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse(204));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(0);
    expect(mockFetch.mock.calls[0]![1].method).toBe('DELETE');
    expect(captured.output.join('')).toContain('@kb-labs/rollout/alert');
  });

  it('WR-02: --instance adds instance to URL', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse(204));

    const captured: Captured = { errors: [], output: [], json: [] };
    await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
      instance: 'prod',
    });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(decodeURIComponent(url)).toContain('@kb-labs/rollout');
    expect(decodeURIComponent(url)).toContain('prod');
    expect(captured.output.join('')).toContain('prod');
  });

  it('WR-03: 404 treated as idempotent success', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse(404));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(0);
  });

  it('WR-04: --json outputs structured result', async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyResponse(204));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
      json: true,
    });

    expect(exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true });
    expect(captured.output.length).toBe(0);
  });

  it('WR-05: missing --plugin → exitCode 1, no fetch', async () => {
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], { event: 'alert' });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('WR-06: not authenticated → exitCode 1', async () => {
    mockLoad.mockResolvedValue(null);
    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('WR-07: server error 500 → exitCode 1', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Internal Server Error' }, 500));

    const captured: Captured = { errors: [], output: [], json: [] };
    const exitCode = await webhookRevoke.run(makeCtx(captured), [], {
      plugin: '@kb-labs/rollout',
      event: 'alert',
    });

    expect(exitCode).toBe(1);
    expect(captured.errors.join('')).toContain('500');
  });
});
