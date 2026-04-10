/**
 * @module @kb-labs/core-platform/logging/prefixed-logger.test
 * Unit tests for prefixed logger wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrefixedLogger, SYSTEM_LOG_FIELDS } from './prefixed-logger';
import type { ILogger } from '../adapters/logger';

/**
 * Create mock logger for testing
 */
function createMockLogger(logs: any[] = [], parentBindings: Record<string, unknown> = {}): ILogger {
  const mockLogger: ILogger = {
    trace(message: string, meta?: Record<string, unknown>) {
      logs.push({ level: 'trace', message, ...parentBindings, ...meta });
    },

    debug(message: string, meta?: Record<string, unknown>) {
      logs.push({ level: 'debug', message, ...parentBindings, ...meta });
    },

    info(message: string, meta?: Record<string, unknown>) {
      logs.push({ level: 'info', message, ...parentBindings, ...meta });
    },

    warn(message: string, meta?: Record<string, unknown>) {
      logs.push({ level: 'warn', message, ...parentBindings, ...meta });
    },

    error(message: string, error?: Error, meta?: Record<string, unknown>) {
      if (error instanceof Error) {
        logs.push({ level: 'error', message, error, ...parentBindings, ...meta });
      } else {
        logs.push({ level: 'error', message, ...parentBindings, ...(error as any) });
      }
    },

    fatal(message: string, error?: Error, meta?: Record<string, unknown>) {
      logs.push({ level: 'fatal', message, ...parentBindings, ...meta });
    },

    child(bindings: Record<string, unknown>): ILogger {
      // Merge parent bindings with new bindings
      return createMockLogger(logs, { ...parentBindings, ...bindings });
    },
  };

  return mockLogger;
}

describe('createPrefixedLogger', () => {
  let logs: any[];
  let consoleWarnSpy: any;

  beforeEach(() => {
    logs = [];
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('system field protection', () => {
    it('should rename system fields to plugin_* prefix', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123', traceId: 'trace-456' });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({ reqId: 'custom', foo: 'bar' });
      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'test',
        reqId: 'req-123',       // ← System field preserved
        plugin_reqId: 'custom', // ← Plugin field renamed
        foo: 'bar',             // ← Non-conflicting field unchanged
      });
    });

    it('should protect all system fields from SYSTEM_LOG_FIELDS', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({
        reqId: 'sys-req',
        traceId: 'sys-trace',
        tenantId: 'sys-tenant',
        layer: 'rest',
      });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        reqId: 'user-req',
        traceId: 'user-trace',
        tenantId: 'user-tenant',
        layer: 'plugin',
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        reqId: 'sys-req',
        traceId: 'sys-trace',
        tenantId: 'sys-tenant',
        layer: 'rest',
        plugin_reqId: 'user-req',
        plugin_traceId: 'user-trace',
        plugin_tenantId: 'user-tenant',
        plugin_layer: 'plugin',
      });
    });

    it('should allow non-system fields without prefixing', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        userId: '456',
        action: 'commit',
        scope: '@kb-labs/workflow',
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        reqId: 'req-123',
        userId: '456',
        action: 'commit',
        scope: '@kb-labs/workflow',
      });
    });
  });

  describe('REST context fields', () => {
    it('should protect REST-specific fields', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({
        method: 'POST',
        url: '/api/v1/commit',
      });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        method: 'GET',
        url: '/custom',
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        method: 'POST',         // ← System
        url: '/api/v1/commit',  // ← System
        plugin_method: 'GET',   // ← Plugin
        plugin_url: '/custom',  // ← Plugin
      });
    });
  });

  describe('Workflow context fields', () => {
    it('should protect Workflow-specific fields', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({
        workflowId: 'wf-123',
        runId: 'run-456',
        stepId: 'step-789',
      });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        workflowId: 'user-wf',
        customField: 'value',
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        workflowId: 'wf-123',         // ← System
        runId: 'run-456',             // ← System
        stepId: 'step-789',           // ← System
        plugin_workflowId: 'user-wf', // ← Plugin
        customField: 'value',         // ← Plugin
      });
    });
  });

  describe('Webhook context fields', () => {
    it('should protect Webhook-specific fields', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({
        event: 'push',
        source: 'github',
      });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        event: 'custom-event',
        data: { foo: 'bar' },
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        event: 'push',                 // ← System
        source: 'github',              // ← System
        plugin_event: 'custom-event',  // ← Plugin
        data: { foo: 'bar' },          // ← Plugin
      });
    });
  });

  describe('Cron context fields', () => {
    it('should protect Cron-specific fields', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({
        cronId: 'daily-cleanup',
        schedule: '0 0 * * *',
      });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        cronId: 'user-cron',
        custom: 'value',
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        cronId: 'daily-cleanup',      // ← System
        schedule: '0 0 * * *',        // ← System
        plugin_cronId: 'user-cron',   // ← Plugin
        custom: 'value',              // ← Plugin
      });
    });
  });

  describe('logging methods', () => {
    it('should proxy all log methods correctly', () => {
      const baseLogger = createMockLogger(logs);
      const prefixed = createPrefixedLogger(baseLogger);

      prefixed.trace('trace message', { meta: 'trace' });
      prefixed.debug('debug message', { meta: 'debug' });
      prefixed.info('info message', { meta: 'info' });
      prefixed.warn('warn message', { meta: 'warn' });
      prefixed.error('error message', new Error('test'), { meta: 'error' });

      expect(logs).toHaveLength(5);
      expect(logs[0]).toMatchObject({ level: 'trace', message: 'trace message', meta: 'trace' });
      expect(logs[1]).toMatchObject({ level: 'debug', message: 'debug message', meta: 'debug' });
      expect(logs[2]).toMatchObject({ level: 'info', message: 'info message', meta: 'info' });
      expect(logs[3]).toMatchObject({ level: 'warn', message: 'warn message', meta: 'warn' });
      expect(logs[4]).toMatchObject({ level: 'error', message: 'error message', meta: 'error' });
      expect(logs[4].error).toBeInstanceOf(Error);
    });
  });

  describe('custom options', () => {
    it('should use custom prefix', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched, { prefix: 'user_' });

      const userLogger = prefixed.child({ reqId: 'custom' });
      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        reqId: 'req-123',
        user_reqId: 'custom', // ← Custom prefix
      });
    });

    it('should use custom protected fields', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ custom: 'system-value' });
      const prefixed = createPrefixedLogger(enriched, {
        protectedFields: new Set(['custom']),
      });

      const userLogger = prefixed.child({ custom: 'user-value', other: 'value' });
      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        custom: 'system-value',
        plugin_custom: 'user-value',
        other: 'value',
      });
    });

    it('should disable warnings when warnOnRename=false', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched, { warnOnRename: false });

      prefixed.child({ reqId: 'custom' });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('development warnings', () => {
    it('should warn in development when renaming fields', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched);

      prefixed.child({ reqId: 'custom', traceId: 'trace' });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "reqId" is reserved')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Renamed to "plugin_reqId"')
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not warn in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched);

      prefixed.child({ reqId: 'custom' });

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('recursive wrapping', () => {
    it('should maintain protection through nested child() calls', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched);

      const level1 = prefixed.child({ userId: '1' });
      const level2 = level1.child({ reqId: 'level2', sessionId: '2' });
      const level3 = level2.child({ reqId: 'level3', requestNum: 3 });

      level3.info('test');

      expect(logs[0]).toMatchObject({
        reqId: 'req-123',          // ← System preserved
        plugin_reqId: 'level3',    // ← Latest plugin value
        userId: '1',
        sessionId: '2',
        requestNum: 3,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty fields object', () => {
      const baseLogger = createMockLogger(logs);
      const prefixed = createPrefixedLogger(baseLogger);

      const userLogger = prefixed.child({});
      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'test',
      });
    });

    it('should handle undefined values', () => {
      const baseLogger = createMockLogger(logs);
      const prefixed = createPrefixedLogger(baseLogger);

      const userLogger = prefixed.child({ foo: undefined, bar: null });
      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        level: 'info',
        message: 'test',
        foo: undefined,
        bar: null,
      });
    });

    it('should handle complex nested objects', () => {
      const baseLogger = createMockLogger(logs);
      const enriched = baseLogger.child({ reqId: 'req-123' });
      const prefixed = createPrefixedLogger(enriched);

      const userLogger = prefixed.child({
        metadata: {
          nested: {
            deep: 'value',
          },
        },
        array: [1, 2, 3],
      });

      userLogger.info('test');

      expect(logs[0]).toMatchObject({
        reqId: 'req-123',
        metadata: {
          nested: {
            deep: 'value',
          },
        },
        array: [1, 2, 3],
      });
    });
  });

  describe('optional log buffer', () => {
    it('should proxy getLogBuffer() if available', () => {
      const mockBuffer = {
        append: vi.fn(),
        query: vi.fn(() => []),
        subscribe: vi.fn(() => () => {}),
        getStats: vi.fn(() => ({ total: 0, bufferSize: 0, oldestTimestamp: null, newestTimestamp: null })),
      };

      const baseLogger = createMockLogger(logs);
      (baseLogger as any).getLogBuffer = () => mockBuffer;

      const prefixed = createPrefixedLogger(baseLogger);

      expect(prefixed.getLogBuffer).toBeDefined();
      expect(prefixed.getLogBuffer!()).toBe(mockBuffer);
    });

    it('should handle missing getLogBuffer()', () => {
      const baseLogger = createMockLogger(logs);
      const prefixed = createPrefixedLogger(baseLogger);

      expect(prefixed.getLogBuffer).toBeUndefined();
    });
  });

  describe('SYSTEM_LOG_FIELDS constant', () => {
    it('should contain all observability fields', () => {
      expect(SYSTEM_LOG_FIELDS.has('reqId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('traceId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('tenantId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('layer')).toBe(true);
    });

    it('should contain REST context fields', () => {
      expect(SYSTEM_LOG_FIELDS.has('method')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('url')).toBe(true);
    });

    it('should contain Workflow context fields', () => {
      expect(SYSTEM_LOG_FIELDS.has('workflowId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('runId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('stepId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('jobId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('attempt')).toBe(true);
    });

    it('should contain Webhook context fields', () => {
      expect(SYSTEM_LOG_FIELDS.has('event')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('source')).toBe(true);
    });

    it('should contain Cron context fields', () => {
      expect(SYSTEM_LOG_FIELDS.has('cronId')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('schedule')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('scheduledAt')).toBe(true);
      expect(SYSTEM_LOG_FIELDS.has('lastRunAt')).toBe(true);
    });
  });
});
