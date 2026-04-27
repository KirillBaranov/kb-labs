/**
 * @module @kb-labs/shared-testing/create-test-context
 *
 * Enhanced test context factory that bridges ctx.platform and the global singleton.
 *
 * Unlike the original createTestContext() from SDK, this version:
 * - Uses mockLLM/mockCache/mockLogger with vi.fn() spies (not noop functions)
 * - Syncs ctx.platform adapters with the global singleton via setupTestPlatform()
 * - Provides a cleanup function to reset the singleton in afterEach()
 *
 * @example
 * ```typescript
 * import { createTestContext, mockLLM } from '@kb-labs/shared-testing';
 *
 * const llm = mockLLM().onAnyComplete().respondWith('hello');
 * const { ctx, cleanup } = createTestContext({ platform: { llm } });
 *
 * // Both work — ctx.platform and useLLM() return the same mock
 * await handler.execute(ctx, args);
 * expect(llm.complete).toHaveBeenCalled();
 *
 * cleanup(); // Reset singleton in afterEach
 * ```
 */

import type {
  PluginContextV3,
  HostContext,
  PlatformServices,
  UIFacade,
  TraceContext,
  RuntimeAPI,
  PluginAPI,
  FSShim,
  FetchShim,
  EnvShim,
  InvokeAPI,
  EnvironmentAPI,
  WorkspaceAPI,
  SnapshotAPI,
} from '@kb-labs/plugin-contracts';

import { setupTestPlatform } from './setup-platform.js';
import { mockLLM } from './mock-llm.js';
import { mockCache } from './mock-cache.js';
import { mockStorage } from './mock-storage.js';
import { mockLogger } from './mock-logger.js';
import { vi } from 'vitest';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface CreateTestContextOptions {
  pluginId?: string;
  pluginVersion?: string;
  host?: 'cli' | 'rest' | 'workflow' | 'webhook';
  hostContext?: HostContext;
  config?: unknown;
  cwd?: string;
  outdir?: string;
  tenantId?: string;
  signal?: AbortSignal;
  /** Override platform services. Also synced to global singleton. */
  platform?: Partial<PlatformServices>;
  /** Override UI facade */
  ui?: Partial<UIFacade>;
  /**
   * If true, sync platform adapters to the global singleton
   * so that useLLM(), useCache(), etc. return the test mocks.
   * @default true
   */
  syncSingleton?: boolean;
}

export interface TestContextResult<TConfig = unknown> {
  /** The plugin context with test mocks */
  ctx: PluginContextV3<TConfig>;
  /** Call in afterEach() to reset the global singleton */
  cleanup: () => void;
}

// ────────────────────────────────────────────────────────────────────
// Mock factories
// ────────────────────────────────────────────────────────────────────

export function createMockTrace(): TraceContext {
  return {
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
    parentSpanId: undefined,
    addEvent: () => {},
    setAttribute: () => {},
    recordError: () => {},
  };
}

export function createMockUI(): UIFacade {
  const messages: string[] = [];

  const mockColor = (text: string) => text;
  const mockColors = {
    success: mockColor,
    error: mockColor,
    warning: mockColor,
    info: mockColor,
    primary: mockColor,
    accent: mockColor,
    highlight: mockColor,
    secondary: mockColor,
    emphasis: mockColor,
    muted: mockColor,
    foreground: mockColor,
    dim: mockColor,
    bold: mockColor,
    underline: mockColor,
    inverse: mockColor,
  };

  return {
    colors: mockColors,
    symbols: {
      success: '+',
      error: 'x',
      warning: '!',
      info: 'i',
      bullet: '-',
      clock: 'T',
      folder: 'D',
      package: 'P',
      pointer: '>',
      section: '#',
      separator: '-',
      border: '|',
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      leftT: '+',
      rightT: '+',
    },
    write: vi.fn((text) => messages.push(`WRITE: ${text}`)),
    info: vi.fn((msg) => messages.push(`INFO: ${msg}`)),
    success: vi.fn((msg) => messages.push(`SUCCESS: ${msg}`)),
    warn: vi.fn((msg) => messages.push(`WARN: ${msg}`)),
    error: vi.fn((err) => messages.push(`ERROR: ${err instanceof Error ? err.message : err}`)),
    debug: vi.fn((msg) => messages.push(`DEBUG: ${msg}`)),
    spinner: vi.fn((msg) => {
      messages.push(`SPINNER: ${msg}`);
      return {
        update: vi.fn((m: string) => messages.push(`SPINNER UPDATE: ${m}`)),
        succeed: vi.fn((m?: string) => messages.push(`SPINNER SUCCEED: ${m ?? msg}`)),
        fail: vi.fn((m?: string) => messages.push(`SPINNER FAIL: ${m ?? msg}`)),
        stop: vi.fn(),
      };
    }),
    table: vi.fn((data) => messages.push(`TABLE: ${JSON.stringify(data)}`)),
    json: vi.fn((data) => messages.push(`JSON: ${JSON.stringify(data)}`)),
    newline: vi.fn(() => messages.push('')),
    divider: vi.fn(() => messages.push('-'.repeat(40))),
    box: vi.fn((content, title) => {
      if (title) {messages.push(`+- ${title} -+`);}
      messages.push(content);
      if (title) {messages.push(`+${'-'.repeat(title.length + 4)}+`);}
    }),
    sideBox: vi.fn((options) => {
      messages.push(`+- ${options.title} -+`);
      if (options.summary) {
        Object.entries(options.summary).forEach(([key, value]) => {
          messages.push(`  ${key}: ${value}`);
        });
      }
      if (options.sections) {
        options.sections.forEach((section: { header?: string; items: string[] }) => {
          if (section.header) {messages.push(`  ${section.header}:`);}
          section.items.forEach((item: string) => messages.push(`    ${item}`));
        });
      }
      if (options.timing) {
        messages.push(`  Timing: ${options.timing}ms`);
      }
      messages.push('+' + '-'.repeat(options.title.length + 4) + '+');
    }),
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => ''),
  };
}

export function createMockRuntime(): RuntimeAPI {
  const mockFS: FSShim = {
    readFile: vi.fn(async () => ''),
    readFileBuffer: vi.fn(async () => new Uint8Array()),
    writeFile: vi.fn(async () => {}),
    readdir: vi.fn(async () => []),
    readdirWithStats: vi.fn(async () => []),
    mkdir: vi.fn(async () => {}),
    rm: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    glob: vi.fn(async () => []),
    stat: vi.fn(async () => ({
      isFile: () => false,
      isDirectory: () => false,
      size: 0,
      mtime: Date.now(),
      ctime: Date.now(),
    })),
    exists: vi.fn(async () => false),
    resolve: (path: string) => path,
    relative: (path: string) => path,
    join: (...segments: string[]) => segments.join('/'),
    dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
    basename: (path: string) => path.split('/').pop() ?? '',
    extname: (path: string) => {
      const base = path.split('/').pop() ?? '';
      const idx = base.lastIndexOf('.');
      return idx > 0 ? base.slice(idx) : '';
    },
  };

  const mockFetch: FetchShim = vi.fn(async () => new Response('mock'));
  const mockEnv: EnvShim = vi.fn((_key: string) => undefined) as EnvShim;

  return {
    fs: mockFS,
    fetch: mockFetch,
    env: mockEnv,
  };
}

export function createMockEnvironmentAPI(): EnvironmentAPI {
  return {
    create: vi.fn(async () => ({
      environmentId: 'env_mock_1',
      provider: 'mock',
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    status: vi.fn(async (environmentId: string) => ({
      environmentId,
      status: 'ready' as const,
      updatedAt: new Date().toISOString(),
    })),
    destroy: vi.fn(async () => {}),
    renewLease: vi.fn(async () => ({
      leaseId: 'lease_mock_1',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })),
  };
}

export function createMockWorkspaceAPI(): WorkspaceAPI {
  return {
    materialize: vi.fn(async () => ({
      workspaceId: 'ws_mock_1',
      provider: 'mock',
      status: 'ready' as const,
      rootPath: '/tmp/ws_mock_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    attach: vi.fn(async (request) => ({
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      mountPath: request.mountPath ?? '/workspace',
      attachedAt: new Date().toISOString(),
    })),
    release: vi.fn(async () => {}),
    status: vi.fn(async (workspaceId: string) => ({
      workspaceId,
      status: 'ready' as const,
      updatedAt: new Date().toISOString(),
    })),
  };
}

export function createMockSnapshotAPI(): SnapshotAPI {
  return {
    capture: vi.fn(async (request) => ({
      snapshotId: request.snapshotId ?? 'snap_mock_1',
      provider: 'mock',
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
    })),
    restore: vi.fn(async (request) => ({
      snapshotId: request.snapshotId,
      restoredAt: new Date().toISOString(),
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      targetPath: request.targetPath,
    })),
    status: vi.fn(async (snapshotId: string) => ({
      snapshotId,
      status: 'ready' as const,
      updatedAt: new Date().toISOString(),
    })),
    delete: vi.fn(async () => {}),
    gc: vi.fn(async (request) => ({
      scanned: 0,
      deleted: 0,
      dryRun: request?.dryRun ?? false,
    })),
  };
}

export function createInfraApiMocks(): Pick<PluginAPI, 'environment' | 'workspace' | 'snapshot'> {
  return {
    environment: createMockEnvironmentAPI(),
    workspace: createMockWorkspaceAPI(),
    snapshot: createMockSnapshotAPI(),
  };
}

export function createMockPluginAPI(): PluginAPI {
  const infra = createInfraApiMocks();
  return {
    lifecycle: {
      onCleanup: vi.fn(),
    },
    state: {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      has: vi.fn(async () => false),
      getMany: vi.fn(async () => new Map()),
      setMany: vi.fn(async () => {}),
    },
    artifacts: {
      write: vi.fn(async () => '/mock/path'),
      list: vi.fn(async () => []),
      read: vi.fn(async () => ''),
      readBuffer: vi.fn(async () => new Uint8Array()),
      exists: vi.fn(async () => false),
      path: vi.fn(() => '/mock/path'),
    },
    shell: {
      exec: vi.fn(async () => ({ code: 0, stdout: '', stderr: '', ok: true })),
    },
    events: {
      emit: vi.fn(async () => {}),
    },
    invoke: {
      call: vi.fn(async (_pluginId: string, _input?: unknown, _options?: unknown) => undefined) as InvokeAPI['call'],
    },
    workflows: {
      run: vi.fn(async () => 'mock-run-id'),
      wait: vi.fn(async () => undefined),
      status: vi.fn(async () => null),
      cancel: vi.fn(async () => {}),
      list: vi.fn(async () => []),
    },
    jobs: {
      submit: vi.fn(async () => 'mock-job-id'),
      schedule: vi.fn(async () => 'mock-scheduled-job-id'),
      wait: vi.fn(async () => undefined),
      status: vi.fn(async () => null),
      cancel: vi.fn(async () => false),
      list: vi.fn(async () => []),
    },
    cron: {
      register: vi.fn(async () => {}),
      unregister: vi.fn(async () => {}),
      list: vi.fn(async () => []),
      pause: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
      trigger: vi.fn(async () => {}),
    },
    environment: infra.environment,
    workspace: infra.workspace,
    snapshot: infra.snapshot,
  };
}

export const createMockPlatformApi = createMockPluginAPI;

export function createMockPluginContextV3<TConfig = unknown>(
  options: CreateTestContextOptions = {}
): TestContextResult<TConfig> {
  return createTestContext<TConfig>(options);
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

/**
 * Create a test context for plugin development.
 *
 * Unlike the original SDK version, this:
 * - Uses mock builders with vi.fn() spies (not noop functions)
 * - Syncs platform adapters to the global singleton by default
 * - Returns a cleanup function for afterEach()
 *
 * @example
 * ```typescript
 * import { createTestContext, mockLLM } from '@kb-labs/shared-testing';
 *
 * describe('my handler', () => {
 *   let cleanup: () => void;
 *
 *   beforeEach(() => {
 *     const llm = mockLLM().onAnyComplete().respondWith('ok');
 *     const result = createTestContext({ platform: { llm } });
 *     cleanup = result.cleanup;
 *     // Use result.ctx in your tests
 *   });
 *
 *   afterEach(() => cleanup());
 * });
 * ```
 */
export function createTestContext<TConfig = unknown>(
  options: CreateTestContextOptions = {}
): TestContextResult<TConfig> {
  const {
    pluginId = 'test-plugin',
    pluginVersion = '0.0.0',
    host = 'cli',
    hostContext,
    config,
    cwd = process.cwd(),
    outdir,
    tenantId,
    signal,
    platform: platformOverrides,
    ui: uiOverrides,
    syncSingleton = true,
  } = options;

  const resolvedOutdir = outdir ?? `${cwd}/.kb/output`;

  // Build default host context
  const defaultHostContext: HostContext =
    hostContext ??
    (() => {
      switch (host) {
        case 'cli':
          return { host: 'cli', argv: ['test'], flags: {} };
        case 'rest':
          return {
            host: 'rest',
            method: 'GET',
            path: '/test',
            requestId: 'test-req-001',
            traceId: 'test-trace-001',
          };
        case 'workflow':
          return { host: 'workflow', workflowId: 'test-wf', runId: 'test-run', stepId: 'test-step' };
        case 'webhook':
          return { host: 'webhook', event: 'test:event' };
      }
    })();

  // Create default mocks (with spies, not noop)
  const defaultLogger = mockLogger();
  const defaultLLM = mockLLM();
  const defaultCache = mockCache();
  const defaultStorage = mockStorage();

  const defaultPlatform: PlatformServices = {
    logger: defaultLogger,
    llm: defaultLLM,
    embeddings: {
      embed: vi.fn(async () => []),
      embedBatch: vi.fn(async () => [[]]),
      dimensions: 1536,
      getDimensions: vi.fn(async () => 1536),
    },
    vectorStore: {
      search: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      count: vi.fn(async () => 0),
    },
    cache: defaultCache,
    storage: defaultStorage,
    analytics: {
      track: vi.fn(async () => {}),
      identify: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
    },
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    },
    config: {
      getConfig: vi.fn(async () => ({})),
      getRawConfig: vi.fn(async () => ({})),
    },
    invoke: {
      call: vi.fn(async () => ({ success: true, data: null })),
      isAvailable: vi.fn(async () => false),
    } as PlatformServices['invoke'],
    sqlDatabase: {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      transaction: vi.fn(async () => ({ query: vi.fn(), commit: vi.fn(), rollback: vi.fn() })),
      close: vi.fn(async () => {}),
    },
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
    } as PlatformServices['documentDatabase'],
    logs: {
      query: vi.fn(async () => ({ logs: [], total: 0, hasMore: false, source: 'buffer' as const })),
      getById: vi.fn(async () => null),
      search: vi.fn(async () => ({ logs: [], total: 0, hasMore: false })),
      subscribe: vi.fn(() => () => {}),
      getStats: vi.fn(async () => ({})),
      getCapabilities: vi.fn(() => ({ hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false })),
    },
  };

  // Merge overrides
  const finalPlatform: PlatformServices = {
    ...defaultPlatform,
    ...platformOverrides,
  };

  // Sync to global singleton
  let cleanupFn = () => {};
  if (syncSingleton) {
    const result = setupTestPlatform({
      llm: finalPlatform.llm,
      cache: finalPlatform.cache,
      storage: finalPlatform.storage,
      logger: finalPlatform.logger,
      analytics: finalPlatform.analytics,
      embeddings: finalPlatform.embeddings,
      vectorStore: finalPlatform.vectorStore,
      eventBus: finalPlatform.eventBus,
    });
    cleanupFn = result.cleanup;
  }

  // UI
  const defaultUI = createMockUI();
  const finalUI: UIFacade = {
    ...defaultUI,
    ...uiOverrides,
  };

  // Build context
  const ctx: PluginContextV3<TConfig> = {
    host,
    requestId: 'test-trace:test-span',
    pluginId,
    pluginVersion,
    tenantId,
    cwd,
    outdir: resolvedOutdir,
    config: config as TConfig,
    signal,
    trace: createMockTrace(),
    hostContext: defaultHostContext,
    ui: finalUI,
    platform: finalPlatform,
    runtime: createMockRuntime(),
    api: createMockPluginAPI(),
  };

  return { ctx, cleanup: cleanupFn };
}
