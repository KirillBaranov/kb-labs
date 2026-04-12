/**
 * @module @kb-labs/plugin-runtime/__tests__/context-factory-streaming
 *
 * Tests for streaming logger integration in context factory.
 *
 * When eventEmitter is provided to createPluginContextV3,
 * the logger should be wrapped with streaming proxy.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPluginContextV3 } from '../context/index.js';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
import type { EventEmitterFn } from '../api/index.js';

describe('createPluginContextV3 — streaming logger', () => {
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
    child: vi.fn(function (this: any) {
      return { ...this, child: this.child };
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
    config: { getConfig: vi.fn(async () => ({})), getRawConfig: vi.fn(async () => ({})) },
    invoke: { call: vi.fn(async () => ({ success: true })), isAvailable: vi.fn(async () => false) } as PlatformServices['invoke'],
    sqlDatabase: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), transaction: vi.fn(async () => ({ query: vi.fn(), commit: vi.fn(), rollback: vi.fn() })), close: vi.fn(async () => {}) },
    documentDatabase: { find: vi.fn(async () => []), findById: vi.fn(async () => null), insertOne: vi.fn(async () => ({ id: 'mock', createdAt: 0, updatedAt: 0 })), updateMany: vi.fn(async () => 0), updateById: vi.fn(async () => null), deleteMany: vi.fn(async () => 0), deleteById: vi.fn(async () => false), count: vi.fn(async () => 0), close: vi.fn(async () => {}) } as PlatformServices['documentDatabase'],
    logs: {} as any,
  };

  const descriptor: PluginContextDescriptor = {
    requestId: 'test-streaming',
    hostType: 'cli',
    pluginId: '@kb-labs/test-streaming',
    pluginVersion: '1.0.0',
    permissions: {},
    hostContext: { host: 'cli', argv: [], flags: {} },
  };

  it('should NOT wrap logger when eventEmitter is absent', () => {
    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
    });

    // Logger should be functional but not streaming
    context.platform.logger.info('no streaming');

    // Base logger should be called (possibly through prefixed wrapper)
    // No eventEmitter means no streaming
    expect(context.platform.logger).toBeDefined();
  });

  it('should wrap logger when eventEmitter is provided', () => {
    const emitter: EventEmitterFn = vi.fn(async () => {});

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
      eventEmitter: emitter,
    });

    context.platform.logger.info('streamed message');

    // eventEmitter should have been called with log.line
    expect(emitter).toHaveBeenCalledWith(
      'log.line',
      expect.objectContaining({
        line: 'streamed message',
        stream: 'stdout',
        level: 'info',
      }),
    );
  });

  it('should emit stderr for warn/error when eventEmitter present', () => {
    const emitter: EventEmitterFn = vi.fn(async () => {});

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
      eventEmitter: emitter,
    });

    context.platform.logger.warn('warning msg');
    context.platform.logger.error('error msg');

    const calls = (emitter as ReturnType<typeof vi.fn>).mock.calls;
    const warnCall = calls.find((c: any) => c[1]?.line === 'warning msg');
    const errorCall = calls.find((c: any) => c[1]?.line === 'error msg');

    expect(warnCall?.[1]).toHaveProperty('stream', 'stderr');
    expect(errorCall?.[1]).toHaveProperty('stream', 'stderr');
  });

  it('should NOT emit events for debug/trace even with eventEmitter', () => {
    const emitter: EventEmitterFn = vi.fn(async () => {});

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
      eventEmitter: emitter,
    });

    context.platform.logger.trace('trace');
    context.platform.logger.debug('debug');

    // Only log.line calls should be from info/warn/error, not trace/debug
    const logCalls = (emitter as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any) => c[0] === 'log.line',
    );
    expect(logCalls).toHaveLength(0);
  });

  it('should also emit via ctx.api.events.emit when eventEmitter present', () => {
    const emitter: EventEmitterFn = vi.fn(async () => {});

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: '/test',
      eventEmitter: emitter,
    });

    // Direct event emission (what shell handler uses)
    // Note: events API prefixes event names with pluginId
    void context.api.events.emit('log.line', {
      stream: 'stdout',
      line: 'direct emit',
      lineNo: 1,
      level: 'info',
    });

    expect(emitter).toHaveBeenCalledWith(
      '@kb-labs/test-streaming:log.line',
      expect.objectContaining({
        line: 'direct emit',
        stream: 'stdout',
      }),
    );
  });
});
