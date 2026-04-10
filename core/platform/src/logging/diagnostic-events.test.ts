import { describe, expect, it, vi } from 'vitest';
import type { ILogger } from '../adapters/logger.js';
import { logDiagnosticEvent } from './diagnostic-events.js';

function createMockLogger(): ILogger {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger),
  };

  return logger as unknown as ILogger;
}

describe('logDiagnosticEvent', () => {
  it('logs structured reason codes and evidence', () => {
    const logger = createMockLogger() as unknown as Record<string, ReturnType<typeof vi.fn>>;

    logDiagnosticEvent(logger as unknown as ILogger, {
      event: 'plugin.routes.validation',
      message: 'Plugin route validation failed',
      reasonCode: 'route_validation_failed',
      level: 'warn',
      pluginId: '@kb-labs/test-plugin',
      issues: ['Route GET /broken: invalid handler reference'],
      evidence: { routeCount: 1 },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Plugin route validation failed',
      expect.objectContaining({
        diagnosticDomain: 'plugin',
        diagnosticEvent: 'plugin.routes.validation',
        reasonCode: 'route_validation_failed',
        pluginId: '@kb-labs/test-plugin',
        issues: ['Route GET /broken: invalid handler reference'],
        evidence: { routeCount: 1 },
      }),
    );
  });

  it('forwards errors on error-level diagnostic events', () => {
    const logger = createMockLogger() as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const error = new Error('handler missing');

    logDiagnosticEvent(logger as unknown as ILogger, {
      event: 'plugin.handler.resolve',
      message: 'Plugin handler file not found',
      reasonCode: 'handler_not_found',
      level: 'error',
      error,
      handlerPath: '/tmp/plugin/dist/missing.js',
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Plugin handler file not found',
      error,
      expect.objectContaining({
        diagnosticEvent: 'plugin.handler.resolve',
        reasonCode: 'handler_not_found',
        handlerPath: '/tmp/plugin/dist/missing.js',
      }),
    );
  });
});
