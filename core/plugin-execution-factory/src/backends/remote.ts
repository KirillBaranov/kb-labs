/**
 * @module @kb-labs/plugin-execution/backends/remote
 *
 * RemoteBackend — routes execution to a remote runtime server via IExecutionTransport.
 *
 * This backend knows nothing about the transport implementation (Gateway, TCP, gRPC).
 * The transport is injected at construction time.
 *
 * Responsibilities:
 *   - handlerRef remapping: absolute host path → /workspace-relative path
 *   - delegating to IExecutionTransport
 *   - stats / health / shutdown
 *
 * Design doc: docs/architecture/execution-isolation.md
 */

import type {
  ExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
  ExecuteOptions,
  HealthStatus,
  ExecutionStats,
} from '../types.js';
import type { IExecutionTransport } from '@kb-labs/core-contracts';
import { normalizeError } from '../utils.js';

export interface RemoteBackendOptions {
  /** Transport implementation (e.g. GatewayDispatchTransport) */
  transport: IExecutionTransport;

  /**
   * If set, remaps handlerRef from absolute host path to /workspace-relative path.
   * E.g. workspaceRootOnHost = '/home/user/projects/kb-labs'
   * '/home/user/projects/kb-labs/dist/h.js' → '/workspace/dist/h.js'
   */
  workspaceRootOnHost?: string;
}

export class RemoteBackend implements ExecutionBackend {
  private readonly transport: IExecutionTransport;
  private readonly workspaceRootOnHost?: string;

  private _stats: ExecutionStats = {
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    avgExecutionTimeMs: 0,
  };
  private executionTimes: number[] = [];
  private readonly startTime = Date.now();

  constructor(options: RemoteBackendOptions) {
    this.transport = options.transport;
    this.workspaceRootOnHost = options.workspaceRootOnHost;
  }

  async execute(
    request: ExecutionRequest,
    _options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    const start = performance.now();

    try {
      const remappedRequest = this.remapRequest(request);
      const { data } = await this.transport.execute(remappedRequest);
      const executionTimeMs = performance.now() - start;
      this.updateStats(true, executionTimeMs);

      return {
        ok: true,
        data,
        executionTimeMs,
        metadata: {
          backend: 'remote',
          target: request.target,
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
          backend: 'remote',
          target: request.target,
        },
      };
    }
  }

  /**
   * Remap handlerRef and pluginRoot from absolute host paths to /workspace paths.
   * No-op if workspaceRootOnHost is not set.
   */
  private remapRequest(request: ExecutionRequest): ExecutionRequest {
    if (!this.workspaceRootOnHost) {
      return request;
    }

    const wsRoot = this.workspaceRootOnHost.replace(/\/$/, '');

    const remap = (p: string): string =>
      p.startsWith(wsRoot) ? '/workspace' + p.slice(wsRoot.length) : p;

    return {
      ...request,
      handlerRef: remap(request.handlerRef),
      pluginRoot: remap(request.pluginRoot),
    };
  }

  private updateStats(success: boolean, durationMs: number): void {
    this._stats.totalExecutions++;
    if (success) { this._stats.successCount++; } else { this._stats.errorCount++; }
    this.executionTimes.push(durationMs);
    if (this.executionTimes.length > 1000) { this.executionTimes.shift(); }
    const sum = this.executionTimes.reduce((a, b) => a + b, 0);
    this._stats.avgExecutionTimeMs = sum / this.executionTimes.length;
  }

  async health(): Promise<HealthStatus> {
    return {
      healthy: true,
      backend: 'remote',
      details: { uptimeMs: Date.now() - this.startTime },
    };
  }

  async stats(): Promise<ExecutionStats> {
    return { ...this._stats };
  }

  async shutdown(): Promise<void> {
    // Transport lifecycle is managed externally
  }
}
