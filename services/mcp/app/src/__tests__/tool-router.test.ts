import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { McpTool } from '../mcp/tool-builder.js';

const executeCommandV3 = vi.fn();
vi.mock('@kb-labs/cli-runtime', () => ({
  executeCommandV3: (...args: unknown[]) => executeCommandV3(...args),
}));

const { callTool } = await import('../mcp/tool-router.js');

const tool: McpTool = {
  name: 'mind__mind_search',
  description: 'search',
  inputSchema: { type: 'object' },
  pluginId: 'mind',
  pluginRoot: '/plugins/mind',
  handlerPath: 'dist/commands/mind-search.js',
  version: '1.2.3',
  operationType: 'read',
  permissions: {},
};

// Minimal container — only the members callTool touches.
const container = {
  logger: { child: () => ({}) },
  getSocketPath: () => '/tmp/sock',
} as unknown as PlatformContainer;
const resolvePlatform = vi.fn(() => container);

describe('callTool', () => {
  beforeEach(() => {
    executeCommandV3.mockReset();
    resolvePlatform.mockClear();
  });

  it('reports success when the command exits 0', async () => {
    executeCommandV3.mockResolvedValue(0);
    const result = await callTool(tool, {}, 'tenant1', resolvePlatform);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('reports failure when the command exits non-zero', async () => {
    executeCommandV3.mockResolvedValue(1);
    const result = await callTool(tool, {}, 'tenant1', resolvePlatform);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('captures UI output produced by the command', async () => {
    executeCommandV3.mockImplementation(async (opts: { ui: { info: (m: string) => void } }) => {
      opts.ui.info('hello from handler');
      return 0;
    });
    const result = await callTool(tool, {}, 'tenant1', resolvePlatform);
    expect(result.output).toContain('hello from handler');
  });

  it('passes plugin identity, flags and tenantId through to executeCommandV3', async () => {
    executeCommandV3.mockResolvedValue(0);
    await callTool(tool, { id: '42' }, 'tenant1', resolvePlatform);
    expect(executeCommandV3).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'mind',
        pluginVersion: '1.2.3',
        pluginRoot: '/plugins/mind',
        flags: { id: '42' },
        tenantId: 'tenant1',
        permissions: {},
      }),
    );
  });

  it('resolves the platform container through the tenant seam', async () => {
    executeCommandV3.mockResolvedValue(0);
    await callTool(tool, {}, 'tenant-xyz', resolvePlatform);
    expect(resolvePlatform).toHaveBeenCalledWith('tenant-xyz');
  });
});
