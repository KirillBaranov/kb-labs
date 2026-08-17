import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock transport and client before importing the command
vi.mock('@kb-labs/host-agent-transport', () => ({
  createTransport: vi.fn().mockReturnValue({}),
}));

vi.mock('@kb-labs/host-agent-client', () => ({
  HostAgentClient: vi.fn(),
}));

import { HostAgentClient } from '@kb-labs/host-agent-client';
import statusCommand from '../../commands/status.js';

const MockedClient = vi.mocked(HostAgentClient);

type HostAgentClientInstance = InstanceType<typeof HostAgentClient>;

/** Returns a partial stub cast to the full HostAgentClient type. */
function makeHostAgentClient(overrides: Partial<HostAgentClientInstance>): HostAgentClientInstance {
  return overrides as unknown as HostAgentClientInstance;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace:status', () => {
  it('CS-01: daemon not running — exitCode 0, running: false', async () => {
    // Simulate IPC unreachable: connect throws
    MockedClient.mockImplementation(() => makeHostAgentClient({
      connect: async () => { throw new Error('ENOENT'); },
      status: async () => { throw new Error('not connected'); },
      close: vi.fn(),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(result.result.running).toBe(false);
    expect(captured.infos.length).toBeGreaterThan(0);
  });

  it('CS-02: daemon running and connected — exitCode 0, running: true, connected: true', async () => {
    MockedClient.mockImplementation(() => makeHostAgentClient({
      connect: async () => undefined,
      status: async () => ({ connected: true, hostId: 'host-123', gatewayUrl: 'http://localhost:4000' }),
      close: vi.fn(),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(result.result.running).toBe(true);
    expect(result.result.connected).toBe(true);
    expect(result.result.hostId).toBe('host-123');
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CS-03: daemon running but disconnected — exitCode 0, running: true, connected: false', async () => {
    MockedClient.mockImplementation(() => makeHostAgentClient({
      connect: async () => undefined,
      status: async () => ({ connected: false, hostId: 'host-456', gatewayUrl: 'http://localhost:4000' }),
      close: vi.fn(),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(result.result.running).toBe(true);
    expect(result.result.connected).toBe(false);
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('CS-04: --json flag with daemon not running outputs { running: false }', async () => {
    MockedClient.mockImplementation(() => makeHostAgentClient({
      connect: async () => { throw new Error('ENOENT'); },
      status: async () => { throw new Error('not connected'); },
      close: vi.fn(),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    expect(result.result.running).toBe(false);
    expect(captured.json[0]).toMatchObject({ running: false });
  });

  it('CS-05: --json flag with connected daemon outputs full status JSON', async () => {
    MockedClient.mockImplementation(() => makeHostAgentClient({
      connect: async () => undefined,
      status: async () => ({ connected: true, hostId: 'host-789', gatewayUrl: 'http://gw:4000' }),
      close: vi.fn(),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await statusCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({
      running: true,
      connected: true,
      hostId: 'host-789',
    });
  });
});
