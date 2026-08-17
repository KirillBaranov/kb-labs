import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock fs/promises to control workspace path validation and config writing
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { stat, writeFile } from 'node:fs/promises';
import registerCommand from '../../commands/register.js';

const VALID_GATEWAY = 'http://localhost:4000';

// Valid client secret: 16+ chars matching /^[A-Za-z0-9_\-+/=]{16,}$/
const VALID_SECRET = 'validSecret12345';

const MOCK_REGISTER_RESPONSE = {
  clientId: 'client-abc',
  clientSecret: VALID_SECRET,
  hostId: 'host-xyz',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace:register', () => {
  it('CR-01: successful registration returns exitCode 0 and configPath', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_REGISTER_RESPONSE,
      text: async () => JSON.stringify(MOCK_REGISTER_RESPONSE),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(true);
    expect(result.result.configPath).toContain('agent.json');
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CR-02: --json flag outputs configPath, hostId, clientId and returns exitCode 0', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_REGISTER_RESPONSE,
      text: async () => JSON.stringify(MOCK_REGISTER_RESPONSE),
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'], json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({
      hostId: MOCK_REGISTER_RESPONSE.hostId,
      clientId: MOCK_REGISTER_RESPONSE.clientId,
    });
  });

  it('CR-03: missing --gateway returns exitCode 1 with validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: '', workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-04: invalid gateway URL (no http/https prefix) returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: 'localhost:4000', workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-05: workspace path does not exist — exitCode 1, error reported', async () => {
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/nonexistent/path'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-06: gateway returns HTTP 500 — exitCode 1, error reported', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-07: fetch throws (unreachable gateway) — exitCode 1, error reported', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('CR-09: --dry-run shows intent, fetch and writeFile are NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'], 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain(VALID_GATEWAY);
  });

  it('CR-08: gateway response missing required fields — exitCode 1', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ clientId: 'only-client' }), // missing clientSecret, hostId
      text: async () => '{"clientId":"only-client"}',
    } as Response);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await registerCommand.execute(
      ctx,
      mockCLIInput({ flags: { gateway: VALID_GATEWAY, workspace: ['/tmp'] } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
