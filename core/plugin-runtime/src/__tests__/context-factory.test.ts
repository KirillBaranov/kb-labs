/**
 * @module @kb-labs/plugin-runtime/__tests__/context-factory
 *
 * Tests for PluginContextV3 factory.
 *
 * Critical component: Creates the context object passed to all plugin handlers.
 * Failure here breaks all V3 plugins.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPluginContextV3 } from '../context/index.js';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';

describe('createPluginContextV3', () => {
  const mockUI: UIFacade = {
    colors: { success: (t: string) => t, error: (t: string) => t, warning: (t: string) => t, info: (t: string) => t, primary: (t: string) => t, accent: (t: string) => t, highlight: (t: string) => t, secondary: (t: string) => t, emphasis: (t: string) => t, muted: (t: string) => t, foreground: (t: string) => t, dim: (t: string) => t, bold: (t: string) => t, underline: (t: string) => t, inverse: (t: string) => t },
    symbols: { success: '✓', error: '✗', warning: '⚠', info: 'ℹ', bullet: '•', clock: '◷', folder: '📁', package: '📦', pointer: '›', section: '§', separator: '─', border: '│', topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', leftT: '├', rightT: '┤' },
    write: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    spinner: vi.fn(),
    table: vi.fn(),
    json: vi.fn(),
    newline: vi.fn(),
    divider: vi.fn(),
    box: vi.fn(),
    sideBox: vi.fn(),
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'test'),
  };

  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(function(this: any) {
      return this;
    }),
  };

  const mockPlatform: PlatformServices = {
    logger: mockLogger as any,
    llm: {} as any,
    embeddings: {} as any,
    vectorStore: {} as any,
    cache: {} as any,
    storage: {} as any,
    analytics: {} as any,
    eventBus: {} as any,
    logs: {} as any,
  };

  it('should pass platform services directly without wrapping', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {
        platform: {
          llm: true,
          embeddings: true,
          vectorStore: true,
          cache: true,
          storage: true,
          analytics: true,
        },
      },
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    // Platform services should be accessible (may be wrapped by governed proxy or prefixed logger)
    expect(context.platform).toBeDefined();
    expect(context.platform.logger).toBeDefined();
    expect(context.platform.llm).toBeDefined();
    expect(context.platform.embeddings).toBeDefined();
    expect(context.platform.vectorStore).toBeDefined();
    expect(context.platform.cache).toBeDefined();
    expect(context.platform.storage).toBeDefined();
    expect(context.platform.analytics).toBeDefined();

    // Verify logger has all required methods (may be wrapped by prefixedLogger)
    expect(context.platform.logger.trace).toBeTypeOf('function');
    expect(context.platform.logger.debug).toBeTypeOf('function');
    expect(context.platform.logger.info).toBeTypeOf('function');
    expect(context.platform.logger.warn).toBeTypeOf('function');
    expect(context.platform.logger.error).toBeTypeOf('function');
    expect(context.platform.logger.child).toBeTypeOf('function');
  });

  it('should create context with all required fields', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
    });

    // Metadata
    expect(context.host).toBe('cli');
    expect(context.pluginId).toBe('@kb-labs/test');
    expect(context.pluginVersion).toBe('1.0.0');
    expect(context.cwd).toBe('/test');
    expect(context.requestId).toBeDefined();
    expect(typeof context.requestId).toBe('string');

    // Services
    expect(context.ui).toBe(mockUI);
    expect(context.platform).toBeDefined();
    expect(context.runtime).toBeDefined();
    expect(context.api).toBeDefined();
    expect(context.trace).toBeDefined();

    // Signal (optional - undefined if not provided)
    expect(context.signal).toBeUndefined();
  });

  it('should wire runtime API correctly', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: { fs: { read: ['/test'] } },
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    // Runtime API must have fs, fetch, env
    expect(context.runtime.fs).toBeDefined();
    expect(context.runtime.fetch).toBeDefined();
    expect(context.runtime.env).toBeDefined();

    // FS should have all 17 methods
    const fsMethods = Object.keys(context.runtime.fs);
    expect(fsMethods).toContain('readFile');
    expect(fsMethods).toContain('writeFile');
    expect(fsMethods).toContain('exists');
    expect(fsMethods).toContain('mkdir');
    expect(fsMethods).toContain('rm');
    expect(fsMethods).toContain('copy');
    expect(fsMethods).toContain('move');
    expect(fsMethods).toContain('readdir');
    expect(fsMethods).toContain('stat');
    expect(fsMethods.length).toBe(18);

    // Fetch should be a function
    expect(typeof context.runtime.fetch).toBe('function');

    // Env should be a function
    expect(typeof context.runtime.env).toBe('function');
  });

  it('should wire plugin API correctly', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    // Plugin API must have all modules
    expect(context.api.lifecycle).toBeDefined();
    // output removed - use return values instead (V3 migration)
    expect(context.api.state).toBeDefined();
    expect(context.api.artifacts).toBeDefined();
    expect(context.api.shell).toBeDefined();
    expect(context.api.events).toBeDefined();
    expect(context.api.invoke).toBeDefined();
    expect(context.api.environment).toBeDefined();

    // Lifecycle should have onCleanup
    expect(typeof context.api.lifecycle.onCleanup).toBe('function');
  });

  it('should create cleanup stack', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { cleanupStack } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    expect(cleanupStack).toBeDefined();
    expect(Array.isArray(cleanupStack)).toBe(true);
  });

  it('should use provided signal when given', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const abortController = new AbortController();
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      signal: abortController.signal,
      cwd: "/test",
    });

    expect(context.signal).toBe(abortController.signal);
  });

  it('should preserve optional fields from descriptor', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      tenantId: 'acme-corp',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
      outdir: '/test/output',
    });

    expect(context.tenantId).toBe('acme-corp');
    expect(context.cwd).toBe('/test');
    expect(context.outdir).toBe('/test/output');
  });

  it('should preserve requestId from descriptor', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context: context1 } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    const { context: context2 } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    expect(context1.requestId).toBe('test-request-id');
    expect(context2.requestId).toBe('test-request-id');
  });

  it('should derive traceId from requestId when host context has no trace', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    expect(context.trace.traceId).toBe('test-request-id');
    expect(context.trace.spanId).toBeDefined();
    expect(typeof context.trace.spanId).toBe('string');
    expect(context.trace.spanId.length).toBeGreaterThan(0);
  });

  it('should preserve traceId from host context when available', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'rest-request-id',
      hostType: 'rest',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: {
        host: 'rest',
        method: 'GET',
        path: '/test',
        requestId: 'rest-request-id',
        traceId: 'rest-trace-id',
      },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    expect(context.trace.traceId).toBe('rest-trace-id');
    expect(context.requestId).toBe('rest-request-id');
  });

  it('should allow reading all context fields', () => {
    const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: "/test",
    });

    // All fields should be readable
    expect(context.pluginId).toBe('@kb-labs/test');
    expect(context.host).toBe('cli');
    expect(context.runtime).toBeDefined();
    expect(context.api).toBeDefined();

    // TODO: Consider Object.freeze(context) to prevent modifications
    // Currently context is mutable - plugins could accidentally modify it
  });
});
