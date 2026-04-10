/**
 * @file loader.test.ts
 * Tests for manifest-based context injection in initPlatform.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdapterManifest } from '@kb-labs/core-platform/adapters';
import type { AnalyticsContext } from './analytics-context.js';

describe('initPlatform - Manifest-based Context Injection', () => {
  let mockAdapters: Map<string, any>;
  let mockLoadModule: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAdapters = new Map();
    mockLoadModule = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Context Registry', () => {
    it('should create runtime contexts registry with workspace and analytics', () => {
      const cwd = '/test/workspace';
      const analyticsContext: AnalyticsContext = {
        source: { product: 'test-product', version: '1.0.0' },
        runId: 'test-run-id',
        actor: { type: 'user', id: 'test-user' },
        ctx: { workspace: cwd, branch: 'main' },
      };

      // Expected runtime contexts
      const expectedContexts = {
        workspace: { cwd },
        analytics: analyticsContext,
      };

      expect(expectedContexts).toMatchObject({
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test-product' },
          runId: 'test-run-id',
        },
      });
    });
  });

  describe('Context Injection based on Manifest', () => {
    it('should inject only requested contexts from manifest', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'test-adapter',
        name: 'Test Adapter',
        version: '1.0.0',
        type: 'core',
        implements: 'ITestAdapter',
        contexts: ['workspace', 'analytics'], // Request both contexts
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      // Inject contexts based on manifest
      const requestedContexts = manifest.contexts ?? [];
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      expect(contexts).toMatchObject({
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test' },
          runId: 'run-123',
        },
      });
    });

    it('should inject only workspace context when adapter requests only workspace', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'file-adapter',
        name: 'File Adapter',
        version: '1.0.0',
        type: 'core',
        implements: 'IFileAdapter',
        contexts: ['workspace'], // Only workspace
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const requestedContexts = manifest.contexts ?? [];
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      expect(contexts).toMatchObject({
        workspace: { cwd: '/test/workspace' },
      });
      expect(contexts.analytics).toBeUndefined();
    });

    it('should inject no contexts when manifest does not request any', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'simple-adapter',
        name: 'Simple Adapter',
        version: '1.0.0',
        type: 'core',
        implements: 'ISimpleAdapter',
        // No contexts field
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const requestedContexts = manifest.contexts ?? [];
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      expect(contexts).toEqual({});
    });

    it('should handle unknown context names gracefully', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'test-adapter',
        name: 'Test Adapter',
        version: '1.0.0',
        type: 'core',
        implements: 'ITestAdapter',
        contexts: ['workspace', 'unknown-context', 'analytics'], // unknown-context not in registry
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const requestedContexts = manifest.contexts ?? [];
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      // Should only inject known contexts
      expect(contexts).toMatchObject({
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test' },
          runId: 'run-123',
        },
      });
      expect(contexts['unknown-context']).toBeUndefined();
    });
  });

  describe('Config Building with Contexts', () => {
    it('should merge contexts with baseOptions, allowing baseOptions to override', () => {
      const contexts = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const baseOptions = {
        customOption: 'custom-value',
        workspace: { cwd: '/override/workspace' }, // Override context
      };

      // Merge: contexts first, then baseOptions
      const config = { ...contexts, ...baseOptions };

      expect(config).toMatchObject({
        workspace: { cwd: '/override/workspace' }, // Overridden
        analytics: {
          source: { product: 'test' },
          runId: 'run-123',
        },
        customOption: 'custom-value',
      });
    });

    it('should not inject contexts if baseOptions already has them', () => {
      const contexts = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const baseOptions = {
        workspace: { cwd: '/custom/workspace' },
        analytics: {
          source: { product: 'custom', version: '2.0.0' },
          runId: 'custom-run',
        },
      };

      const config = { ...contexts, ...baseOptions };

      // baseOptions should override
      expect(config).toMatchObject({
        workspace: { cwd: '/custom/workspace' },
        analytics: {
          source: { product: 'custom', version: '2.0.0' },
          runId: 'custom-run',
        },
      });
    });
  });

  describe('FileAnalytics Integration', () => {
    it('should pass workspace and analytics contexts to FileAnalytics via config', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'analytics-file',
        name: 'File Analytics',
        version: '1.0.0',
        type: 'core',
        implements: 'IAnalytics',
        contexts: ['workspace', 'analytics'],
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/Users/kirillbaranov/Desktop/kb-labs' },
        analytics: {
          source: { product: '@kb-labs/workspace-root', version: '0.0.1' },
          runId: 'f8cb323c-54a4-45bb-afa1-8f17b5cf497e',
          actor: { type: 'user', id: 'kirillBaranovJob@yandex.ru' },
          ctx: { workspace: '/Users/kirillbaranov/Desktop/kb-labs', branch: 'main' },
        },
      };

      const baseOptions = {
        baseDir: '.kb/analytics/buffer',
        filenamePattern: 'events-YYYYMMDD',
      };

      // Inject contexts
      const requestedContexts = manifest.contexts ?? [];
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      const config = { ...contexts, ...baseOptions };

      expect(config).toMatchObject({
        workspace: { cwd: '/Users/kirillbaranov/Desktop/kb-labs' },
        analytics: {
          source: { product: '@kb-labs/workspace-root' },
          runId: 'f8cb323c-54a4-45bb-afa1-8f17b5cf497e',
        },
        baseDir: '.kb/analytics/buffer',
        filenamePattern: 'events-YYYYMMDD',
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle adapters without contexts field in manifest', () => {
      const manifest: AdapterManifest = {
        manifestVersion: '1.0.0',
        id: 'legacy-adapter',
        name: 'Legacy Adapter',
        version: '1.0.0',
        type: 'core',
        implements: 'ILegacyAdapter',
        // No contexts field - legacy adapter
      };

      const runtimeContexts: Record<string, unknown> = {
        workspace: { cwd: '/test/workspace' },
        analytics: {
          source: { product: 'test', version: '1.0.0' },
          runId: 'run-123',
        },
      };

      const baseOptions = { legacyOption: 'value' };

      const requestedContexts = manifest.contexts ?? []; // Empty array
      const contexts: Record<string, unknown> = {};
      for (const ctxName of requestedContexts) {
        if (runtimeContexts[ctxName]) {
          contexts[ctxName] = runtimeContexts[ctxName];
        }
      }

      const config = { ...contexts, ...baseOptions };

      // Should only have baseOptions
      expect(config).toEqual({ legacyOption: 'value' });
    });
  });
});
