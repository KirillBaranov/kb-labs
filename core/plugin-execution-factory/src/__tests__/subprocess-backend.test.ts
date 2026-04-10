import { describe, expect, it, vi } from 'vitest';
import type { ExecutionRequest } from '../types.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
  };
});

function createPlatform() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger),
  };

  return {
    logger,
  } as any;
}

function createRequest(): ExecutionRequest {
  return {
    executionId: 'exec-1',
    handlerRef: './dist/missing-handler.js#default',
    pluginRoot: '/tmp/plugin',
    input: {},
    descriptor: {
      pluginId: '@kb-labs/test-plugin',
      pluginVersion: '1.0.0',
      hostContext: { hostType: 'workflow' },
    } as any,
  };
}

describe('SubprocessBackend diagnostics', () => {
  it('logs structured handler_not_found event before returning error', async () => {
    const { SubprocessBackend } = await import('../backends/subprocess.js');
    const platform = createPlatform();
    const backend = new SubprocessBackend({
      platform,
      runner: {
        runInSubprocess: vi.fn(),
      } as any,
      ipcServerFactory: vi.fn(),
    });

    const result = await backend.execute(createRequest());

    expect(result.ok).toBe(false);
    expect(platform.logger.error).toHaveBeenCalledWith(
      'Plugin handler file not found',
      undefined,
      expect.objectContaining({
        diagnosticEvent: 'plugin.handler.resolve',
        reasonCode: 'handler_not_found',
        pluginId: '@kb-labs/test-plugin',
        handlerRef: './dist/missing-handler.js#default',
      }),
    );
  });
});
