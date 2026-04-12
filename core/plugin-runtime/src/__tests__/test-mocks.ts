/**
 * Shared test mock objects for plugin-runtime tests.
 *
 * Provides typed mock implementations of PlatformServices and UIFacade
 * that satisfy the full interface contracts.
 */

import { vi } from 'vitest';
import type { PlatformServices, UIFacade } from '@kb-labs/plugin-contracts';

/**
 * Create a typed mock ILogger
 */
export function createMockLogger() {
  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

/**
 * Create a typed mock PlatformServices with all required fields
 */
export function createMockPlatform(): PlatformServices {
  const logger = createMockLogger();
  return {
    logger: logger as unknown as PlatformServices['logger'],
    llm: {
      complete: vi.fn(),
      stream: vi.fn(),
    } as unknown as PlatformServices['llm'],
    embeddings: {
      embed: vi.fn(),
      embedBatch: vi.fn(),
      getDimensions: vi.fn(),
    } as unknown as PlatformServices['embeddings'],
    vectorStore: {
      search: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    } as unknown as PlatformServices['vectorStore'],
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      zadd: vi.fn(),
      zrangebyscore: vi.fn(),
      zrem: vi.fn(),
      setIfNotExists: vi.fn(),
    } as unknown as PlatformServices['cache'],
    storage: {
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
    } as unknown as PlatformServices['storage'],
    analytics: {
      track: vi.fn(),
      identify: vi.fn(),
    } as unknown as PlatformServices['analytics'],
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as unknown as PlatformServices['eventBus'],
    logs: {
      query: vi.fn(async () => ({ logs: [], total: 0, hasMore: false, source: 'buffer' as const })),
      getById: vi.fn(async () => null),
      search: vi.fn(async () => ({ logs: [], total: 0, hasMore: false })),
      subscribe: vi.fn(() => () => {}),
      getStats: vi.fn(async () => ({})),
      getCapabilities: vi.fn(() => ({ hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false })),
    } as unknown as PlatformServices['logs'],
    config: {
      getConfig: vi.fn(async () => ({})),
      getRawConfig: vi.fn(async () => ({})),
    } as unknown as PlatformServices['config'],
    invoke: {
      call: vi.fn(async () => ({ success: true })),
      isAvailable: vi.fn(async () => false),
    } as unknown as PlatformServices['invoke'],
    sqlDatabase: {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      transaction: vi.fn(async () => ({ query: vi.fn(), commit: vi.fn(), rollback: vi.fn() })),
      close: vi.fn(async () => {}),
    } as unknown as PlatformServices['sqlDatabase'],
    documentDatabase: {
      find: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      insertOne: vi.fn(async () => ({ id: 'mock', createdAt: 0, updatedAt: 0 })),
      updateMany: vi.fn(async () => 0),
      updateById: vi.fn(async () => null),
      deleteMany: vi.fn(async () => 0),
      deleteById: vi.fn(async () => false),
      count: vi.fn(async () => 0),
      close: vi.fn(async () => {}),
    } as unknown as PlatformServices['documentDatabase'],
  };
}

/**
 * Create a typed mock UIFacade with all required fields
 */
export function createMockUI(): UIFacade {
  return {
    colors: {
      success: (t: string) => t,
      error: (t: string) => t,
      warning: (t: string) => t,
      info: (t: string) => t,
      primary: (t: string) => t,
      accent: (t: string) => t,
      highlight: (t: string) => t,
      secondary: (t: string) => t,
      emphasis: (t: string) => t,
      muted: (t: string) => t,
      foreground: (t: string) => t,
      dim: (t: string) => t,
      bold: (t: string) => t,
      underline: (t: string) => t,
      inverse: (t: string) => t,
    },
    symbols: {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      bullet: '•',
      clock: '◷',
      folder: '📁',
      package: '📦',
      pointer: '›',
      section: '§',
      separator: '─',
      border: '│',
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      leftT: '├',
      rightT: '┤',
    },
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
}
