/**
 * @module @kb-labs/plugin-execution-factory/isolated-backend
 *
 * createIsolatedExecutionBackend — unified factory for all hosts (workflow, rest-api, webhook, etc).
 *
 * Encapsulates execution plane routing and provisioning:
 *   - requests with target.environmentId → RemoteBackend (explicit override / pre-provisioned)
 *   - requests without environmentId + provisionEnvironment → auto-provision → RemoteBackend
 *   - requests without environmentId, no provisionEnvironment → local backend
 *
 * Hosts are dumb — they call backend.execute() and get results.
 * All provisioning (workspace, environment, cleanup) is handled here.
 *
 * Layer discipline:
 *   core-contracts  ← IExecutionTransport (interface)
 *   this file       ← StrictIsolationOptions + createIsolatedExecutionBackend()
 *   gateway-core    ← GatewayDispatchTransport (implements IExecutionTransport)
 *   loader.ts       ← wires transport + provisionEnvironment into StrictIsolationOptions
 */

import type { IExecutionTransport, IHostResolver } from '@kb-labs/core-contracts';
import type { BackendOptions, ExecutionBackend, ExecutionRequest, ExecuteOptions, ExecutionResult } from './types.js';
import { RemoteBackend } from './backends/remote.js';
import { createExecutionBackend } from './factory.js';

/**
 * Per-job context for both container provisioning and transport creation.
 * runtimeHostId is deterministic (derived from provisioningRunId), known before container starts.
 * namespaceId scopes the Gateway connection (used for JWT issuance and dispatch routing).
 */
export interface RemoteJobContext {
  /** Deterministic id the runtime server will register under (e.g. "runtime-abc123") */
  runtimeHostId: string;
  /** Tenant/namespace for Gateway routing and JWT */
  namespaceId: string;
}

/**
 * Options for container/remote execution.
 * Injected by loader.ts — transport factory + optional auto-provisioning.
 */
export interface StrictIsolationOptions {
  /**
   * Build an IExecutionTransport for a given job.
   * Called per-job in the RoutingBackend when target.environmentId is present.
   */
  buildTransport(ctx: RemoteJobContext): IExecutionTransport;

  /**
   * Absolute path on the host that maps to /workspace inside the container.
   * Used for handlerRef remapping: /host/abs/path → /workspace/rel/path.
   */
  workspaceRootOnHost?: string;

  /**
   * Auto-provision execution environment when target.environmentId is absent.
   * Encapsulates full lifecycle: workspace materialize → environment reserve/start →
   * workspace attach → [execute] → cleanup (release + destroy).
   *
   * Called by RoutingBackend for every execute() without pre-set environmentId.
   * Hosts never call adapters directly — execution plane handles everything.
   *
   * When target.environmentId IS present, this is skipped (explicit override).
   */
  provisionEnvironment?: (request: ExecutionRequest) => Promise<{
    environmentId: string;
    namespace: string;
    cleanup: () => Promise<void>;
  }>;

  // ── Workspace Agent routing ────────────────────────────────────

  /**
   * Resolve a Workspace Agent host for target.type === 'workspace-agent'.
   * Execution layer calls this abstraction — never Gateway/HTTP directly.
   */
  hostResolver?: IHostResolver;

  /**
   * Build a transport to a specific host (by hostId).
   * Used after hostResolver returns a hostId.
   */
  buildTransportForHost?: (hostId: string, namespaceId: string) => IExecutionTransport;

  /**
   * What to do when hostResolver returns null (no host found).
   * - 'local': fall through to local backend (default)
   * - 'error': return ExecutionError immediately
   */
  fallbackPolicy?: 'local' | 'error';
}

export interface IsolatedBackendOptions {
  /** BackendOptions for local execution (platform, mode, workerPool, etc.) */
  localBackend: BackendOptions;

  /**
   * When present, enables remote execution via RoutingBackend.
   * When absent, all requests go to the local backend.
   */
  strictIsolation?: StrictIsolationOptions;
}

/**
 * Create an execution backend suitable for any host.
 *
 * - Without strictIsolation: returns a plain local backend.
 * - With strictIsolation: returns a RoutingBackend that dispatches by environmentId,
 *   optionally auto-provisioning containers when environmentId is absent.
 *
 * Used by workflow-daemon, rest-api, webhook hosts — identical call site for all.
 */
export function createIsolatedExecutionBackend(options: IsolatedBackendOptions): ExecutionBackend {
  const localBackend = createExecutionBackend(options.localBackend);

  if (!options.strictIsolation) {
    return localBackend;
  }

  const {
    buildTransport, workspaceRootOnHost, provisionEnvironment,
    hostResolver, buildTransportForHost, fallbackPolicy,
  } = options.strictIsolation;

  return buildRoutingBackend(
    localBackend,
    (ctx) => new RemoteBackend({
      transport: buildTransport(ctx),
      workspaceRootOnHost,
    }),
    provisionEnvironment,
    hostResolver,
    buildTransportForHost
      ? (hostId, ns) => new RemoteBackend({ transport: buildTransportForHost(hostId, ns) })
      : undefined,
    fallbackPolicy,
  );
}

/**
 * Wrap a local backend with per-job routing:
 *
 *   1. target.environmentId present  → remote (container mode)
 *   2. target.type === 'workspace-agent' + hostResolver → resolve host → remote
 *   3. provisionEnvironment available → auto-provision container → remote
 *   4. default → localBackend (in-process / worker-pool)
 */
function buildRoutingBackend(
  localBackend: ExecutionBackend,
  remoteFactory: (ctx: RemoteJobContext) => ExecutionBackend,
  provisionEnvironment?: StrictIsolationOptions['provisionEnvironment'],
  hostResolver?: IHostResolver,
  hostBackendFactory?: (hostId: string, namespaceId: string) => ExecutionBackend,
  fallbackPolicy?: 'local' | 'error',
): ExecutionBackend {
  return {
    async execute(request: ExecutionRequest, execOptions?: ExecuteOptions) {
      const target = request.target;
      const namespaceId = target?.namespace ?? 'default';

      // 1. Explicit environment (container mode) — highest priority
      if (target?.environmentId) {
        const ctx: RemoteJobContext = { runtimeHostId: target.environmentId, namespaceId };
        return remoteFactory(ctx).execute(request, execOptions);
      }

      // 2. Workspace Agent routing
      if (target?.type === 'workspace-agent' && hostResolver && hostBackendFactory) {
        const resolution = await hostResolver.resolve(target);
        if (resolution) {
          return hostBackendFactory(resolution.hostId, resolution.namespaceId).execute(request, execOptions);
        }
        // No host found — apply fallback policy
        if (fallbackPolicy === 'error') {
          const result: ExecutionResult = {
            ok: false,
            error: {
              message: `No workspace agent available for target (strategy: ${target.hostSelection ?? 'any-matching'})`,
              code: 'NO_HOST_AVAILABLE',
            },
            executionTimeMs: 0,
          };
          return result;
        }
        // fallbackPolicy === 'local' (default): fall through to local backend
      }

      // 3. Auto-provision container
      if (provisionEnvironment) {
        let cleanup: (() => Promise<void>) | undefined;
        try {
          const provisioned = await provisionEnvironment(request);
          cleanup = provisioned.cleanup;
          const ctx: RemoteJobContext = { runtimeHostId: provisioned.environmentId, namespaceId: provisioned.namespace };
          return await remoteFactory(ctx).execute(request, execOptions);
        } finally {
          await cleanup?.();
        }
      }

      // 4. Local backend (in-process, worker-pool)
      return localBackend.execute(request, execOptions);
    },
    health: () => localBackend.health(),
    stats: () => localBackend.stats(),
    shutdown: async () => localBackend.shutdown(),
  };
}
