/**
 * @module @kb-labs/plugin-runtime/__tests__/context-structure
 *
 * Integration tests that verify the ACTUAL RUNTIME STRUCTURE of PluginContextV3.
 *
 * These tests prevent API drift by ensuring type definitions match runtime.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPluginContextV3 } from '../context/index.js';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';

describe('Context Structure (Runtime Verification)', () => {
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
    child: vi.fn(function(this: any) { return this; }),
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

  const descriptor: PluginContextDescriptor = {
    hostType: 'cli',
    pluginId: '@kb-labs/test',
    pluginVersion: '1.0.0',
    requestId: 'test-req-123',
    permissions: {},
    hostContext: { host: 'cli', argv: [], flags: {} },
  };

  it('should provide complete context structure to handlers', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    // Top-level fields
    expect(context.host).toBe('cli');
    expect(typeof context.requestId).toBe('string');
    expect(context.requestId.length).toBeGreaterThan(0);
    expect(context.pluginId).toBe('@kb-labs/test');
    expect(context.pluginVersion).toBe('1.0.0');
    expect(context.cwd).toBe('/test/cwd');

    // Services
    expect(context.ui).toBeDefined();
    expect(context.platform).toBeDefined();
    expect(context.runtime).toBeDefined();
    expect(context.api).toBeDefined();
    expect(context.trace).toBeDefined();

    // Signal
    expect(context.signal).toBeUndefined(); // Optional field
  });

  it('should provide UI facade with all 13 methods', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    const uiMethods = Object.keys(context.ui);
    expect(uiMethods).toContain('info');
    expect(uiMethods).toContain('success');
    expect(uiMethods).toContain('warn');
    expect(uiMethods).toContain('error');
    expect(uiMethods).toContain('debug');
    expect(uiMethods).toContain('spinner');
    expect(uiMethods).toContain('table');
    expect(uiMethods).toContain('json');
    expect(uiMethods).toContain('newline');
    expect(uiMethods).toContain('divider');
    expect(uiMethods).toContain('box');
    expect(uiMethods).toContain('confirm');
    expect(uiMethods).toContain('prompt');
  });

  it('should provide Runtime API with fs, fetch, env', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    expect(context.runtime.fs).toBeDefined();
    expect(context.runtime.fetch).toBeDefined();
    expect(context.runtime.env).toBeDefined();

    // Verify fs has expected methods
    expect(typeof context.runtime.fs.readFile).toBe('function');
    expect(typeof context.runtime.fs.writeFile).toBe('function');
    expect(typeof context.runtime.fs.exists).toBe('function');
    expect(typeof context.runtime.fs.readdir).toBe('function');
    expect(typeof context.runtime.fs.mkdir).toBe('function');
    expect(typeof context.runtime.fs.rm).toBe('function');
  });

  it('should provide Plugin API with lifecycle, state, etc.', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    expect(context.api.lifecycle).toBeDefined();
    expect(context.api.state).toBeDefined();
    expect(context.api.environment).toBeDefined();
    expect(typeof context.api.lifecycle.onCleanup).toBe('function');
  });

  it('should provide Platform services', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    expect(context.platform.logger).toBeDefined();
    expect(context.platform.llm).toBeDefined();
    expect(context.platform.embeddings).toBeDefined();
    expect(context.platform.vectorStore).toBeDefined();
    expect(context.platform.cache).toBeDefined();
    expect(context.platform.storage).toBeDefined();
    expect(context.platform.analytics).toBeDefined();
  });

  it('should provide trace context', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
    });

    expect(context.trace).toBeDefined();
    expect(typeof context.trace.traceId).toBe('string');
    expect(typeof context.trace.spanId).toBe('string');
  });

  it('should preserve optional fields (tenantId, outdir)', () => {
    const descriptorWithOptionals: PluginContextDescriptor = {
      ...descriptor,
      tenantId: 'test-tenant',
    };

    const { context } = createPluginContextV3({
      descriptor: descriptorWithOptionals,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
      outdir: '/test/outdir',
    });

    expect(context.tenantId).toBe('test-tenant');
    expect(context.outdir).toBe('/test/outdir');
  });

  it('should pass signal if provided', () => {
    const abortController = new AbortController();

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test/cwd',
      signal: abortController.signal,
    });

    expect(context.signal).toBe(abortController.signal);
  });
});
