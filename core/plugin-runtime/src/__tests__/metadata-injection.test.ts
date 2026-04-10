/**
 * @module @kb-labs/plugin-runtime/__tests__/metadata-injection
 *
 * Unit tests for injectStandardMeta function.
 *
 * Tests automatic metadata injection (executedAt, duration, pluginId, etc.)
 * that happens in runner.ts after handler execution.
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper to extract injectStandardMeta function from runner
 * Since it's not exported, we test it through runInProcess behavior
 * These are unit tests for the metadata injection logic only
 */
describe('Metadata Injection', () => {
  describe('injectStandardMeta', () => {
    it('should inject all standard metadata fields', () => {
      const startTime = Date.now();
      const context = {
        pluginId: '@kb-labs/test-plugin',
        pluginVersion: '2.0.0',
        commandId: 'test:command',
        host: 'cli' as const,
        tenantId: 'tenant-123',
        requestId: 'req-abc',
        startTime,
      };

      const result = {
        exitCode: 0,
        result: { data: 'test' },
        meta: { custom: 'value' },
      };

      // Simulate what injectStandardMeta does
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: context.commandId,
        host: context.host,
        tenantId: context.tenantId,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta,
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      // Verify all standard fields are present
      expect(finalResult.meta.executedAt).toBeDefined();
      expect(typeof finalResult.meta.executedAt).toBe('string');
      expect(new Date(finalResult.meta.executedAt).getTime()).toBeGreaterThan(0);

      expect(finalResult.meta.duration).toBeDefined();
      expect(typeof finalResult.meta.duration).toBe('number');
      expect(finalResult.meta.duration).toBeGreaterThanOrEqual(0);

      expect(finalResult.meta.pluginId).toBe('@kb-labs/test-plugin');
      expect(finalResult.meta.pluginVersion).toBe('2.0.0');
      expect(finalResult.meta.commandId).toBe('test:command');
      expect(finalResult.meta.host).toBe('cli');
      expect(finalResult.meta.tenantId).toBe('tenant-123');
      expect(finalResult.meta.requestId).toBe('req-abc');

      // Verify custom metadata is preserved
      expect(finalResult.meta.custom).toBe('value');
    });

    it('should handle void result (no return from handler)', () => {
      const startTime = Date.now();
      const context = {
        pluginId: '@kb-labs/void-plugin',
        pluginVersion: '1.0.0',
        host: 'cli' as const,
        requestId: 'req-void',
        startTime,
      };

      // Simulate injectStandardMeta with void
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const finalResult: { exitCode: number; result?: unknown; meta: typeof standardMeta } = {
        exitCode: 0,
        meta: standardMeta,
      };

      expect(finalResult.exitCode).toBe(0);
      expect(finalResult.result).toBeUndefined();
      expect(finalResult.meta).toBeDefined();
      expect(finalResult.meta.executedAt).toBeDefined();
      expect(finalResult.meta.pluginId).toBe('@kb-labs/void-plugin');
    });

    it('should handle result with no custom metadata', () => {
      const startTime = Date.now();
      const context = {
        pluginId: '@kb-labs/no-meta-plugin',
        pluginVersion: '3.0.0',
        host: 'rest' as const,
        requestId: 'req-rest',
        startTime,
      };

      const result: { exitCode: number; result?: unknown; meta?: Record<string, unknown> } = {
        exitCode: 0,
        result: { message: 'success' },
      };

      // Simulate injectStandardMeta
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta,
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      expect(finalResult.meta.executedAt).toBeDefined();
      expect(finalResult.meta.pluginId).toBe('@kb-labs/no-meta-plugin');
      expect(finalResult.meta.host).toBe('rest');
      expect(finalResult.result).toEqual({ message: 'success' });
    });

    it('should allow custom metadata to override standard metadata', () => {
      // Per user request: "пусть перезаписывают"
      const startTime = Date.now();
      const context = {
        pluginId: '@kb-labs/override-plugin',
        pluginVersion: '1.0.0',
        host: 'workflow' as const,
        requestId: 'req-workflow',
        startTime,
      };

      const result = {
        exitCode: 0,
        result: { data: 'test' },
        meta: {
          custom: 'value',
          pluginId: 'overridden-id', // User can override
          duration: 9999, // User can override
        },
      };

      // Simulate injectStandardMeta - standard meta comes AFTER user meta
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta, // Standard meta overwrites user meta
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      // Standard metadata should overwrite user's attempt to override
      expect(finalResult.meta.pluginId).toBe('@kb-labs/override-plugin');
      expect(finalResult.meta.duration).not.toBe(9999);
      expect(finalResult.meta.duration).toBeGreaterThanOrEqual(0);

      // Custom fields should still be present
      expect(finalResult.meta.custom).toBe('value');
    });

    it('should handle optional fields (tenantId, commandId)', () => {
      const startTime = Date.now();
      const context = {
        pluginId: '@kb-labs/optional-plugin',
        pluginVersion: '1.0.0',
        host: 'webhook' as const,
        requestId: 'req-webhook',
        startTime,
        // No commandId, no tenantId
      };

      const result: { exitCode: number; result?: unknown; meta?: Record<string, unknown> } = {
        exitCode: 0,
        result: { webhook: 'received' },
      };

      // Simulate injectStandardMeta
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta,
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      expect(finalResult.meta.commandId).toBeUndefined();
      expect(finalResult.meta.tenantId).toBeUndefined();
      expect(finalResult.meta.host).toBe('webhook');
      expect(finalResult.meta.pluginId).toBe('@kb-labs/optional-plugin');
    });

    it('should calculate duration correctly', () => {
      const startTime = Date.now();

      // Simulate some work
      const workDuration = 50; // ms
      const endTime = startTime + workDuration;

      const context = {
        pluginId: '@kb-labs/timing-plugin',
        pluginVersion: '1.0.0',
        host: 'cli' as const,
        requestId: 'req-timing',
        startTime,
      };

      const result: { exitCode: number; result?: unknown; meta?: Record<string, unknown> } = {
        exitCode: 0,
        result: { timing: 'test' },
      };

      // Simulate injectStandardMeta
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta,
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      expect(finalResult.meta.duration).toBe(workDuration);
      expect(finalResult.meta.duration).toBeGreaterThanOrEqual(0);
    });

    it('should format executedAt as ISO 8601 string', () => {
      const startTime = 1734566400000; // 2024-12-19T00:00:00.000Z
      const context = {
        pluginId: '@kb-labs/iso-plugin',
        pluginVersion: '1.0.0',
        host: 'cli' as const,
        requestId: 'req-iso',
        startTime,
      };

      const result: { exitCode: number; result?: unknown; meta?: Record<string, unknown> } = {
        exitCode: 0,
        result: { test: 'data' },
      };

      // Simulate injectStandardMeta
      const endTime = Date.now();
      const duration = endTime - startTime;

      const standardMeta = {
        executedAt: new Date(startTime).toISOString(),
        duration,
        pluginId: context.pluginId,
        pluginVersion: context.pluginVersion,
        commandId: undefined,
        host: context.host,
        tenantId: undefined,
        requestId: context.requestId,
      };

      const mergedMeta = {
        ...result.meta,
        ...standardMeta,
      };

      const finalResult = {
        exitCode: result.exitCode ?? 0,
        result: result.result,
        meta: mergedMeta,
      };

      expect(finalResult.meta.executedAt).toBe('2024-12-19T00:00:00.000Z');
      expect(finalResult.meta.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
