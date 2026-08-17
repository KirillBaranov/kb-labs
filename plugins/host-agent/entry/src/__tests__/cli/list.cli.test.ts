import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock fs to prevent reading ~/.kb/agent.json during tests
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockImplementation(() => {
    throw new Error('ENOENT');
  }),
}));

import listCommand from '../../commands/list.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeHost = (overrides: Partial<{
  hostId: string;
  name: string;
  status: string;
  capabilities: string[];
  lastSeen: number;
  connections: string[];
}> = {}) => ({
  hostId: 'host-1',
  name: 'my-machine',
  status: 'online',
  capabilities: ['filesystem', 'git'],
  lastSeen: Date.now() - 5000,
  connections: [],
  ...overrides,
});

describe('workspace:list', () => {
  it('CL-01: returns exitCode 0 and prints success when hosts are returned', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hosts: [makeHost()] }),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(ctx, mockCLIInput({ flags: { gateway: 'http://localhost:4000' } }));

    expect(result.ok).toBe(true);
    expect(result.result.hosts).toHaveLength(1);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CL-02: --json flag outputs hosts array and returns exitCode 0', async () => {
    const host = makeHost();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hosts: [host] }),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'http://localhost:4000', json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ hosts: [{ hostId: 'host-1' }] });
  });

  it('CL-03: empty host list prints info message and returns exitCode 0', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hosts: [] }),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'http://localhost:4000' } }),
    );

    expect(result.ok).toBe(true);
    expect(result.result.hosts).toHaveLength(0);
    expect(captured.infos.length).toBeGreaterThan(0);
  });

  it('CL-04: gateway returns HTTP 401 — exitCode 1, error reported', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'http://localhost:4000' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CL-05: fetch throws (gateway unreachable) — exitCode 1, error reported', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'http://localhost:4000' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CL-06: multiple hosts — all returned in result', async () => {
    const hosts = [
      makeHost({ hostId: 'h1', name: 'machine-1', status: 'online' }),
      makeHost({ hostId: 'h2', name: 'machine-2', status: 'offline' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hosts }),
    } as Response);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'http://localhost:4000' } }),
    );

    expect(result.ok).toBe(true);
    expect(result.result.hosts).toHaveLength(2);
  });
});
