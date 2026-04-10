/**
 * Create a test context for plugin development
 */

import type {
  PluginContextV3,
  HostContext,
  PlatformServices,
  UIFacade,
  Logger,
  TraceContext,
  RuntimeAPI,
  PluginAPI,
  FSShim,
  FetchShim,
  EnvShim,
} from '@kb-labs/plugin-contracts';

export interface CreateTestContextOptions {
  /**
   * Plugin ID
   */
  pluginId?: string;

  /**
   * Plugin version
   */
  pluginVersion?: string;

  /**
   * Host type
   */
  host?: 'cli' | 'rest' | 'workflow' | 'webhook';

  /**
   * Host context
   */
  hostContext?: HostContext;

  /**
   * Plugin configuration
   */
  config?: unknown;

  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Output directory
   */
  outdir?: string;

  /**
   * Tenant ID
   */
  tenantId?: string;

  /**
   * Abort signal
   */
  signal?: AbortSignal;

  /**
   * Override platform services
   */
  platform?: Partial<PlatformServices>;

  /**
   * Override UI facade
   */
  ui?: Partial<UIFacade>;
}

/**
 * Create a mock logger
 */
function createMockLogger(): Logger {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    trace: noop,
    child: () => createMockLogger(),
  };
}

/**
 * Create a mock trace context
 */
function createMockTrace(): TraceContext {
  return {
    traceId: 'test-trace-id',
    spanId: 'test-span-id',
    parentSpanId: undefined,
    addEvent: () => {},
    setAttribute: () => {},
    recordError: () => {},
  };
}

/**
 * Create a mock UI facade
 */
function createMockUI(): UIFacade {
  const messages: string[] = [];

  // Mock colors (no-op)
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
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ',
      bullet: '•',
      clock: '⏱',
      folder: '📁',
      package: '📦',
      pointer: '→',
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
    write: (text) => messages.push(`WRITE: ${text}`),
    info: (msg) => messages.push(`INFO: ${msg}`),
    success: (msg) => messages.push(`SUCCESS: ${msg}`),
    warn: (msg) => messages.push(`WARN: ${msg}`),
    error: (err) => messages.push(`ERROR: ${err instanceof Error ? err.message : err}`),
    debug: (msg) => messages.push(`DEBUG: ${msg}`),
    spinner: (msg) => {
      messages.push(`SPINNER: ${msg}`);
      return {
        update: (m) => messages.push(`SPINNER UPDATE: ${m}`),
        succeed: (m) => messages.push(`SPINNER SUCCEED: ${m ?? msg}`),
        fail: (m) => messages.push(`SPINNER FAIL: ${m ?? msg}`),
        stop: () => {},
      };
    },
    table: (data) => messages.push(`TABLE: ${JSON.stringify(data)}`),
    json: (data) => messages.push(`JSON: ${JSON.stringify(data)}`),
    newline: () => messages.push(''),
    divider: () => messages.push('─'.repeat(40)),
    box: (content, title) => {
      if (title) {messages.push(`┌─ ${title} ─┐`);}
      messages.push(content);
      if (title) {messages.push(`└${'─'.repeat(title.length + 4)}┘`);}
    },
    sideBox: (options) => {
      messages.push(`┌─ ${options.title} ─┐`);
      if (options.summary) {
        Object.entries(options.summary).forEach(([key, value]) => {
          messages.push(`  ${key}: ${value}`);
        });
      }
      if (options.sections) {
        options.sections.forEach(section => {
          if (section.header) {messages.push(`  ${section.header}:`);}
          section.items.forEach(item => messages.push(`    ${item}`));
        });
      }
      if (options.timing) {
        messages.push(`  Timing: ${options.timing}ms`);
      }
      messages.push('└' + '─'.repeat(options.title.length + 4) + '┘');
    },
    confirm: async () => true,
    prompt: async () => '',
  };
}

/**
 * Create a mock platform services
 */
function createMockPlatform(): PlatformServices {
  const asyncNoop = async () => {};

  return {
    logger: createMockLogger(),
    llm: {
      complete: async () => ({ content: 'mock response', usage: { promptTokens: 0, completionTokens: 0 }, model: 'mock' }),
      stream: async function* () { yield 'mock'; },
    },
    embeddings: {
      embed: async () => [],
      embedBatch: async () => [[]],
      dimensions: 1536,
      getDimensions: async () => 1536,
    },
    vectorStore: {
      search: async () => [],
      upsert: asyncNoop,
      delete: asyncNoop,
      count: async () => 0,
    },
    cache: {
      get: async () => null,
      set: asyncNoop,
      delete: asyncNoop,
      clear: asyncNoop,
      zadd: asyncNoop,
      zrangebyscore: async () => [],
      zrem: asyncNoop,
      setIfNotExists: async () => false,
    },
    storage: {
      read: async () => Buffer.from(''),
      write: asyncNoop,
      delete: asyncNoop,
      list: async () => [],
      exists: async () => false,
    },
    analytics: {
      track: asyncNoop,
      identify: asyncNoop,
      flush: asyncNoop,
    },
    eventBus: {
      publish: asyncNoop,
      subscribe: () => () => {},
    },
    logs: {
      query: async () => ({ logs: [], total: 0, hasMore: false, source: 'buffer' as const }),
      getById: async () => null,
      search: async () => ({ logs: [], total: 0, hasMore: false }),
      subscribe: () => () => {},
      getStats: async () => ({}),
      getCapabilities: () => ({ hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false }),
    },
  };
}

/**
 * Create a mock runtime API
 */
function createMockRuntime(): RuntimeAPI {
  const mockFS: FSShim = {
    readFile: async () => '',
    readFileBuffer: async () => new Uint8Array(),
    writeFile: async () => {},
    readdir: async () => [],
    readdirWithStats: async () => [],
    mkdir: async () => {},
    rm: async () => {},
    copy: async () => {},
    move: async () => {},
    glob: async () => [],
    stat: async () => ({
      isFile: () => false,
      isDirectory: () => false,
      size: 0,
      mtime: Date.now(),
      ctime: Date.now(),
    }),
    exists: async () => false,
    resolve: (path) => path,
    relative: (path) => path,
    join: (...segments) => segments.join('/'),
    dirname: (path) => path.split('/').slice(0, -1).join('/'),
    basename: (path) => path.split('/').pop() ?? '',
    extname: (path) => {
      const base = path.split('/').pop() ?? '';
      const idx = base.lastIndexOf('.');
      return idx > 0 ? base.slice(idx) : '';
    },
  };

  const mockFetch: FetchShim = async () => new Response('mock');

  const mockEnv: EnvShim = (_key: string) => undefined;

  return {
    fs: mockFS,
    fetch: mockFetch,
    env: mockEnv,
  };
}

/**
 * Create a mock plugin API
 */
function createMockPluginAPI(): PluginAPI {
  const asyncNoop = async () => {};
  const now = () => new Date().toISOString();

  return {
    lifecycle: {
      onCleanup: () => {},
    },
    state: {
      get: async () => undefined,
      set: asyncNoop,
      delete: asyncNoop,
      has: async () => false,
      getMany: async () => new Map(),
      setMany: asyncNoop,
    },
    artifacts: {
      write: async () => '/mock/path',
      list: async () => [],
      read: async () => '',
      readBuffer: async () => new Uint8Array(),
      exists: async () => false,
      path: () => '/mock/path',
    },
    shell: {
      exec: async () => ({ code: 0, stdout: '', stderr: '', ok: true }),
    },
    events: {
      emit: asyncNoop,
    },
    invoke: {
      call: async <T>() => undefined as T,
    },
    workflows: {
      run: async () => 'mock-run-id',
      wait: async () => undefined,
      status: async () => null,
      cancel: asyncNoop,
      list: async () => [],
    },
    jobs: {
      submit: async () => 'mock-job-id',
      schedule: async () => 'mock-scheduled-job-id',
      wait: async () => undefined,
      status: async () => null,
      cancel: async () => false,
      list: async () => [],
    },
    cron: {
      register: asyncNoop,
      unregister: asyncNoop,
      list: async () => [],
      pause: asyncNoop,
      resume: asyncNoop,
      trigger: asyncNoop,
    },
    environment: {
      create: async () => ({
        environmentId: 'env_mock_1',
        provider: 'mock',
        status: 'ready',
        createdAt: now(),
        updatedAt: now(),
      }),
      status: async (environmentId: string) => ({
        environmentId,
        status: 'ready',
        updatedAt: now(),
      }),
      destroy: asyncNoop,
      renewLease: async () => ({
        leaseId: 'lease_mock_1',
        acquiredAt: now(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    },
    workspace: {
      materialize: async () => ({
        workspaceId: 'ws_mock_1',
        provider: 'mock',
        status: 'ready',
        rootPath: '/tmp/ws_mock_1',
        createdAt: now(),
        updatedAt: now(),
      }),
      attach: async (request) => ({
        workspaceId: request.workspaceId,
        environmentId: request.environmentId,
        mountPath: request.mountPath ?? '/workspace',
        attachedAt: now(),
      }),
      release: asyncNoop,
      status: async (workspaceId: string) => ({
        workspaceId,
        status: 'ready',
        updatedAt: now(),
      }),
    },
    snapshot: {
      capture: async (request) => ({
        snapshotId: request.snapshotId ?? 'snap_mock_1',
        provider: 'mock',
        status: 'ready',
        createdAt: now(),
        updatedAt: now(),
        workspaceId: request.workspaceId,
        environmentId: request.environmentId,
      }),
      restore: async (request) => ({
        snapshotId: request.snapshotId,
        restoredAt: now(),
        workspaceId: request.workspaceId,
        environmentId: request.environmentId,
        targetPath: request.targetPath,
      }),
      status: async (snapshotId: string) => ({
        snapshotId,
        status: 'ready',
        updatedAt: now(),
      }),
      delete: asyncNoop,
      gc: async (request) => ({
        scanned: 0,
        deleted: 0,
        dryRun: request?.dryRun ?? false,
      }),
    },
  };
}

/**
 * Create a test context for plugin development
 *
 * @example
 * ```typescript
 * const context = createTestContext({
 *   pluginId: 'my-plugin',
 *   host: 'cli',
 *   config: { apiKey: 'test-key' },
 * });
 *
 * const result = await handler.execute(context, { name: 'World' });
 * ```
 */
export function createTestContext<TConfig = unknown>(
  options: CreateTestContextOptions = {}
): PluginContextV3<TConfig> {
  const {
    pluginId = 'test-plugin',
    pluginVersion = '0.0.0',
    host = 'cli',
    hostContext,
    config,
    cwd = process.cwd(),
    outdir = `${cwd}/.kb/output`,
    tenantId,
    signal,
    platform,
    ui,
  } = options;

  // Generate default host context based on host type
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

  // Merge platform and UI overrides
  const mockPlatform = createMockPlatform();
  const finalPlatform: PlatformServices = {
    ...mockPlatform,
    ...platform,
  };

  const mockUI = createMockUI();
  const finalUI: UIFacade = {
    ...mockUI,
    ...ui,
  };

  // Create context
  const context: PluginContextV3<TConfig> = {
    host,
    requestId: 'test-trace:test-span',
    pluginId,
    pluginVersion,
    tenantId,
    cwd,
    outdir,
    config: config as TConfig,
    signal,
    trace: createMockTrace(),
    hostContext: defaultHostContext,
    ui: finalUI,
    platform: finalPlatform,
    runtime: createMockRuntime(),
    api: createMockPluginAPI(),
  };

  return context;
}
