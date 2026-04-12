/**
 * @module @kb-labs/plugin-execution/backends/subprocess
 *
 * SubprocessBackend - Level 0.5 execution.
 * Runs handlers in separate subprocess with IPC communication.
 * Process isolation without worker pool overhead.
 *
 * ## Use Cases
 *
 * - Development/testing with process isolation
 * - Single-shot execution without pool management
 * - Debugging handler failures without affecting main process
 * - Sandboxed execution for untrusted code
 *
 * ## Comparison with other backends
 *
 * - InProcessBackend: Same process, no isolation, fastest
 * - SubprocessBackend: Single subprocess per execution, isolated, simple
 * - WorkerPoolBackend: Pool of reusable workers, production-ready
 * - RemoteExecutionBackend: Remote executor service (Phase 3)
 *
 * ## Architecture
 *
 * Parent Process:
 * 1. Creates Unix socket server for platform API
 * 2. Forks child process with socket path
 * 3. Waits for IPC messages (ready, result, error)
 * 4. Cleans up socket after execution
 *
 * Child Process:
 * 1. Connects to Unix socket
 * 2. Receives execution request via IPC
 * 3. Executes handler with platform proxy
 * 4. Sends result back via IPC
 * 5. Exits
 *
 * ## runInSubprocess Contract (v5)
 *
 * This backend delegates to `runInSubprocess()` from @kb-labs/plugin-runtime.
 * The contract is:
 *
 * - Input: descriptor, socketPath, handlerPath, input, timeoutMs, signal
 * - Output: RunResult<T> { data: T, meta: ExecutionMeta }
 * - Throws: PluginError on handler failure, TimeoutError on timeout
 *
 * Handler returns raw data (T), runner wraps it in RunResult.
 * Backend passes data to caller; CLI/REST hosts add their own formatting.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { IPlatformAdapters } from '@kb-labs/core-platform';
import { logDiagnosticEvent } from '@kb-labs/core-platform';
import type {
  ExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
  ExecuteOptions,
  HealthStatus,
  ExecutionStats,
  HostType,
} from '../types.js';
import type { PlatformServices, UIFacade } from '@kb-labs/plugin-contracts';
import { noopUI } from '@kb-labs/plugin-contracts';
import type { ISubprocessRunner } from '@kb-labs/core-contracts';
import type { UnixSocketServerConfig } from '@kb-labs/core-ipc';
import { localWorkspaceManager } from '../workspace/local.js';
import type { WorkspaceLease } from '../workspace/types.js';
import { normalizeError } from '../utils.js';
import { resolveExecutionTarget } from '../target-resolver.js';
import {
  AbortError,
  HandlerNotFoundError,
} from '../errors.js';

/**
 * IPC server interface for subprocess communication.
 * Abstracts Unix sockets (Unix/macOS/Linux) and process IPC (Windows).
 */
export interface IPCServer {
  /** Start the server and begin listening */
  start(): Promise<void>;

  /** Stop the server and cleanup resources */
  close(): Promise<void>;

  /** Get connection info for child process (socket path or 'ipc') */
  getConnectionInfo(): string;

  /** Get auth token for child process platform calls */
  getAuthToken(): string;
}

/**
 * Factory function to create IPC server.
 * Allows platform-specific server creation (Unix sockets vs process IPC).
 */
export type IPCServerFactory = (platform: PlatformServices, executionId: string) => Promise<IPCServer>;

/**
 * Ensure platform is a PlatformContainer.
 * If it's just PlatformServices, wrap it.
 */
function ensurePlatformContainer(platform: PlatformServices): IPlatformAdapters {
  return platform as unknown as IPlatformAdapters;
}

/**
 * Wrap UnixSocketServer to match IPCServer interface.
 */
class UnixSocketIPCServer implements IPCServer {
  private socketPath: string;
  private authToken: string;
  private server: { start(): Promise<void>; close(): Promise<void> };

  constructor(
    server: { start(): Promise<void>; close(): Promise<void> },
    socketPath: string,
    authToken: string
  ) {
    this.server = server;
    this.socketPath = socketPath;
    this.authToken = authToken;
  }

  async start(): Promise<void> {
    await this.server.start();
  }

  async close(): Promise<void> {
    await this.server.close();
  }

  getConnectionInfo(): string {
    return this.socketPath;
  }

  getAuthToken(): string {
    return this.authToken;
  }
}

/**
 * Create default IPC server factory based on platform.
 * - Unix/Linux/macOS: Unix socket server (faster, ~100x for large messages)
 * - Windows: Process IPC server (process.send/on)
 */
function createDefaultIPCServerFactory(): IPCServerFactory {
  return async (platform: PlatformServices, executionId: string): Promise<IPCServer> => {
    // Platform needs to be PlatformContainer for servers
    const platformContainer = ensurePlatformContainer(platform);

    if (process.platform === 'win32') {
      // Cross-platform: Unix domain socket on Linux/macOS, named pipe on Windows.
      // Node.js net API handles both transparently via createSocketPath().
      const { UnixSocketServer, createSocketPath } = await import('@kb-labs/core-ipc');
      const socketPath = createSocketPath(`subprocess-${executionId}`);
      const authToken = randomBytes(32).toString('hex');
      const serverConfig: UnixSocketServerConfig = { socketPath };
      (serverConfig as unknown as Record<string, unknown>).authToken = authToken;
      const server = new UnixSocketServer(platformContainer, serverConfig);
      return new UnixSocketIPCServer(server, socketPath, authToken);
    } else {
      const { UnixSocketServer, createSocketPath } = await import('@kb-labs/core-ipc');
      const socketPath = createSocketPath(`subprocess-${executionId}`);
      const authToken = randomBytes(32).toString('hex');
      const serverConfig: UnixSocketServerConfig = { socketPath };
      (serverConfig as unknown as Record<string, unknown>).authToken = authToken;
      const server = new UnixSocketServer(platformContainer, serverConfig);
      return new UnixSocketIPCServer(server, socketPath, authToken);
    }
  };
}

/**
 * SubprocessBackend options.
 */
export interface SubprocessBackendOptions {
  /** Platform services */
  platform: PlatformServices;

  /**
   * Subprocess runner implementation (dependency injection).
   * Allows swapping different subprocess execution strategies.
   */
  runner: ISubprocessRunner;

  /**
   * UI provider for different host types.
   * Default: always noopUI (silent).
   * For CLI: return real UI when hostType === 'cli'.
   */
  uiProvider?: (hostType: HostType) => UIFacade;

  /**
   * Default timeout for subprocess execution in milliseconds.
   * Default: 30000 (30 seconds)
   */
  defaultTimeoutMs?: number;

  /**
   * IPC server factory for creating platform-specific servers.
   * Default: Unix socket server (Unix/macOS/Linux compatible).
   * For Windows: use process IPC factory.
   */
  ipcServerFactory?: IPCServerFactory;
}

/**
 * SubprocessBackend - executes handlers in separate subprocess.
 *
 * Features:
 * - Process isolation (crashes don't affect main process)
 * - Simple lifecycle (one subprocess per execution)
 * - Unix socket for platform API communication
 * - Timeout support with SIGKILL
 * - Abort signal support
 * - No pool overhead
 *
 * Limitations:
 * - No worker reuse (slower than WorkerPoolBackend)
 * - No concurrency control
 * - No warmup support
 */
export class SubprocessBackend implements ExecutionBackend {
  private _stats: ExecutionStats = {
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    avgExecutionTimeMs: 0,
  };
  private executionTimes: number[] = [];
  private startTime = Date.now();
  private readonly platform: PlatformServices;
  private readonly runner: ISubprocessRunner;
  private readonly uiProvider: (hostType: HostType) => UIFacade;
  private readonly defaultTimeoutMs: number;
  private readonly ipcServerFactory: IPCServerFactory;

  // Active IPC servers (one per execution)
  private activeServers = new Map<string, IPCServer>();

  constructor(options: SubprocessBackendOptions) {
    this.platform = options.platform;
    this.runner = options.runner;
    this.uiProvider = options.uiProvider ?? (() => noopUI);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.ipcServerFactory = options.ipcServerFactory ?? createDefaultIPCServerFactory();
  }

  async execute(
    request: ExecutionRequest,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    const start = performance.now();
    let lease: WorkspaceLease | undefined;
    let ipcServer: IPCServer | undefined;
    let resolvedExecutionId = request.executionId;
    let resolvedTarget = request.target;

    try {
      // 1. Check abort before starting
      if (options?.signal?.aborted) {
        throw new AbortError('Execution aborted before start');
      }

      const requestToExecute = await resolveExecutionTarget(request, this.platform);
      resolvedExecutionId = requestToExecute.executionId;
      resolvedTarget = requestToExecute.target;

      // 2. Lease workspace (trivial for local)
      lease = await localWorkspaceManager.lease(requestToExecute.workspace, {
        executionId: requestToExecute.executionId,
        pluginRoot: requestToExecute.pluginRoot,
      });

      // 3. Resolve handler path and verify existence
      const hashIndex = requestToExecute.handlerRef.indexOf('#');
      const relPath = hashIndex > 0 ? requestToExecute.handlerRef.slice(0, hashIndex) : requestToExecute.handlerRef;
      let handlerPath = path.resolve(lease.pluginRoot, relPath);
      // Manifest handler paths are relative to the manifest file (typically in dist/).
      // If not found at pluginRoot, try resolving from dist/ subdirectory.
      if (!fs.existsSync(handlerPath)) {
        const distPath = path.resolve(lease.pluginRoot, 'dist', relPath.replace(/^\.\//, ''));
        if (fs.existsSync(distPath)) {
          handlerPath = distPath;
        }
      }

      if (!fs.existsSync(handlerPath)) {
        logDiagnosticEvent(this.platform.logger, {
          event: 'plugin.handler.resolve',
          level: 'error',
          reasonCode: 'handler_not_found',
          message: 'Plugin handler file not found',
          outcome: 'failed',
          pluginId: requestToExecute.descriptor.pluginId,
          pluginVersion: requestToExecute.descriptor.pluginVersion,
          handlerRef: requestToExecute.handlerRef,
          handlerPath,
          evidence: {
            executionId: requestToExecute.executionId,
            pluginRoot: lease.pluginRoot,
            hostType: requestToExecute.descriptor.hostType,
          },
        });
        throw new HandlerNotFoundError(handlerPath);
      }

      // 4. Create IPC server using factory (platform-specific)
      ipcServer = await this.ipcServerFactory(this.platform, requestToExecute.executionId);
      await ipcServer.start();

      // Track active server
      this.activeServers.set(requestToExecute.executionId, ipcServer);

      // 5. Get connection info for subprocess
      const socketPath = ipcServer.getConnectionInfo();
      const platformAuthToken = ipcServer.getAuthToken();

      // 6. Get timeout (from request or default)
      const timeoutMs = requestToExecute.timeoutMs ?? this.defaultTimeoutMs;

      // 7. Execute via subprocess runner (dependency injection)
      // NOTE: UI is not passed to subprocess - subprocess uses platform proxy
      // UI would need to be serialized and proxied, which is complex
      // For now, subprocess handlers use noopUI or log via platform.logger
      const previousToken = process.env.KB_PLATFORM_SOCKET_TOKEN;
      const previousExecutionId = process.env.KB_EXECUTION_ID;
      const previousTenantId = process.env.KB_TENANT_ID;
      const previousTraceId = process.env.KB_TRACE_ID;

      process.env.KB_PLATFORM_SOCKET_TOKEN = platformAuthToken;
      process.env.KB_EXECUTION_ID = requestToExecute.executionId;
      if (requestToExecute.context?.tenantId) {
        process.env.KB_TENANT_ID = requestToExecute.context.tenantId;
      }
      if (requestToExecute.context?.traceId) {
        process.env.KB_TRACE_ID = requestToExecute.context.traceId;
      }

      let runResult;
      try {
        runResult = await this.runner.runInSubprocess({
          descriptor: requestToExecute.descriptor,
          platformSocketPath: socketPath,
          platformAuthToken,
          handlerPath,
          exportName: requestToExecute.exportName,
          input: requestToExecute.input,
          timeoutMs,
          signal: options?.signal,
          cwd: lease.cwd,
          outdir: undefined, // Optional, defaults to ${cwd}/.kb/output
          onLog: options?.onLog,
        });
      } finally {
        if (previousToken === undefined) {
          delete process.env.KB_PLATFORM_SOCKET_TOKEN;
        } else {
          process.env.KB_PLATFORM_SOCKET_TOKEN = previousToken;
        }
        if (previousExecutionId === undefined) {
          delete process.env.KB_EXECUTION_ID;
        } else {
          process.env.KB_EXECUTION_ID = previousExecutionId;
        }
        if (previousTenantId === undefined) {
          delete process.env.KB_TENANT_ID;
        } else {
          process.env.KB_TENANT_ID = previousTenantId;
        }
        if (previousTraceId === undefined) {
          delete process.env.KB_TRACE_ID;
        } else {
          process.env.KB_TRACE_ID = previousTraceId;
        }
      }

      // 7. Success - handler completed without throwing
      const executionTimeMs = performance.now() - start;
      this.updateStats(true, executionTimeMs);

      return {
        ok: true,
        data: runResult.data,
        executionTimeMs,
        metadata: {
          backend: 'subprocess',
          workspaceId: lease.workspaceId,
          executionMeta: runResult.executionMeta,
          target: resolvedTarget,
        },
      };
    } catch (error) {
      const executionTimeMs = performance.now() - start;
      this.updateStats(false, executionTimeMs);

      return {
        ok: false,
        error: normalizeError(error),
        executionTimeMs,
        metadata: {
          backend: 'subprocess',
          workspaceId: lease?.workspaceId,
          target: resolvedTarget,
        },
      };
    } finally {
      // CRITICAL: Always cleanup
      // 1. Stop and remove IPC server
      if (ipcServer) {
        try {
          await ipcServer.close();
          this.activeServers.delete(resolvedExecutionId);
        } catch (cleanupError) {
          // Log but don't throw - already handling main error
          this.platform.logger.warn('Failed to close IPC server', {
            executionId: resolvedExecutionId,
            error: cleanupError,
          });
        }
      }

      // 2. Release workspace
      if (lease) {
        await localWorkspaceManager.release(lease).catch(() => {
          // Swallow release errors - already handling main error
        });
      }
    }
  }

  /**
   * Update execution statistics.
   */
  private updateStats(success: boolean, durationMs: number): void {
    this._stats.totalExecutions++;

    if (success) {
      this._stats.successCount++;
    } else {
      this._stats.errorCount++;
    }

    // Track execution times for percentiles (keep last 1000)
    this.executionTimes.push(durationMs);
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }

    // Calculate average
    const sum = this.executionTimes.reduce((a, b) => a + b, 0);
    this._stats.avgExecutionTimeMs = sum / this.executionTimes.length;

    // Calculate percentiles
    if (this.executionTimes.length >= 10) {
      const sorted = [...this.executionTimes].sort((a, b) => a - b);
      this._stats.p95ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.95)];
      this._stats.p99ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.99)];
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      healthy: true,
      backend: 'subprocess',
      details: {
        uptimeMs: Date.now() - this.startTime,
        activeSubprocesses: this.activeServers.size,
      },
    };
  }

  async stats(): Promise<ExecutionStats> {
    return { ...this._stats };
  }

  async shutdown(): Promise<void> {
    // Stop all active socket servers
    const shutdownPromises = Array.from(this.activeServers.values()).map(
      server => server.close().catch(() => {
        // Swallow errors during shutdown
      })
    );

    await Promise.all(shutdownPromises);
    this.activeServers.clear();
  }
}
