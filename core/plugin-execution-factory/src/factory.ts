/**
 * @module @kb-labs/plugin-execution/factory
 *
 * Factory for creating execution backends.
 * Simple by default, enterprise when needed.
 */

import type { BackendOptions, ExecutionBackend, ExecutionRequest } from './types.js';
import { InProcessBackend } from './backends/in-process.js';
import { SubprocessBackend } from './backends/subprocess.js';
import { WorkerPoolBackend } from './backends/worker-pool/backend.js';
import { RemoteBackend } from './backends/remote.js';
import { SubprocessRunnerAdapter } from './adapters/index.js';

/**
 * Create execution backend based on options.
 *
 * Mode detection:
 * - 'auto' (default): Detect based on environment
 * - 'in-process': Always use InProcessBackend (same process, no isolation)
 * - 'subprocess': Always use SubprocessBackend (single subprocess, process isolation)
 * - 'worker-pool': Always use WorkerPoolBackend (pool of workers, production-ready)
 * - 'remote': Always use RemoteExecutionBackend (remote executor service)
 *
 * @example
 * ```typescript
 * // Simplest - just works
 * const backend = createExecutionBackend({ platform });
 *
 * // Explicit mode
 * const backend = createExecutionBackend({
 *   platform,
 *   mode: 'worker-pool',
 *   workerPool: { min: 2, max: 10 },
 * });
 * ```
 */
export function createExecutionBackend(options: BackendOptions): ExecutionBackend {
  const mode = options.mode === 'auto' || !options.mode
    ? detectMode()
    : options.mode;

  switch (mode) {
    case 'in-process':
      return new InProcessBackend({
        platform: options.platform,
        uiProvider: options.uiProvider,
        pluginInvoker: options.pluginInvoker,
      });

    case 'subprocess':
      return new SubprocessBackend({
        platform: options.platform,
        runner: new SubprocessRunnerAdapter(),
        uiProvider: options.uiProvider,
      });

    case 'worker-pool':
      return new WorkerPoolBackend({
        platform: options.platform,
        platformTransport: options.platformTransport,
        uiProvider: options.uiProvider,
        min: options.workerPool?.min ?? 2,
        max: options.workerPool?.max ?? 10,
        maxRequestsPerWorker: options.workerPool?.maxRequestsPerWorker ?? 1000,
        maxUptimeMsPerWorker: options.workerPool?.maxUptimeMsPerWorker ?? 30 * 60 * 1000,
        maxConcurrentPerPlugin: options.workerPool?.maxConcurrentPerPlugin,
        warmup: options.workerPool?.warmup ?? { mode: 'none', topN: 5, maxHandlers: 20 },
      });

    case 'remote': {
      if (!options.remote?.transport) {
        throw new Error('Remote mode requires options.remote.transport (IExecutionTransport)');
      }
      const remoteBackend = new RemoteBackend({
        transport: options.remote.transport,
        workspaceRootOnHost: options.remote.workspaceRootOnHost,
      });
      return createRoutingBackend(options, remoteBackend);
    }

    default:
      throw new Error(`Unknown execution mode: ${mode}`);
  }
}

/**
 * Detect execution mode based on environment (may include 'remote').
 */
function detectMode(): BackendOptions['mode'] {
  // Remote if executor endpoint is configured
  if (process.env.EXECUTOR_SERVICE_ENDPOINT) {
    return 'remote';
  }

  // Worker pool if explicitly enabled or Kubernetes
  if (
    process.env.EXECUTION_MODE === 'worker-pool' ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return 'worker-pool';
  }

  // Default: in-process (simplest)
  return 'in-process';
}

/**
 * Detect local execution mode — never returns 'remote'.
 */
function detectLocalMode(): 'in-process' | 'subprocess' | 'worker-pool' {
  if (
    process.env.EXECUTION_MODE === 'worker-pool' ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return 'worker-pool';
  }
  if (process.env.EXECUTION_MODE === 'subprocess') {
    return 'subprocess';
  }
  return 'in-process';
}

/**
 * Wrap a local backend with routing logic:
 * if request.target.environmentId is set → RemoteBackend,
 * otherwise → local backend.
 *
 * This allows isolation: strict to coexist with isolation: relaxed/balanced
 * without changing call sites — the backend decides dynamically.
 */
function createRoutingBackend(options: BackendOptions, remoteBackend: RemoteBackend): ExecutionBackend {
  const localBackend = createLocalBackend(options);

  return {
    async execute(request: ExecutionRequest, execOptions?) {
      if (request.target?.environmentId) {
        return remoteBackend.execute(request, execOptions);
      }
      return localBackend.execute(request, execOptions);
    },
    health: () => localBackend.health(),
    stats: () => localBackend.stats(),
    shutdown: async () => {
      await Promise.all([localBackend.shutdown(), remoteBackend.shutdown()]);
    },
  };
}

/**
 * Create a local (non-remote) backend based on options.
 * Used internally by createRoutingBackend.
 * Never returns remote — remote routing is handled by createRoutingBackend.
 */
function createLocalBackend(options: BackendOptions): ExecutionBackend {
  const mode = detectLocalMode();
  switch (mode) {
    case 'in-process':
      return new InProcessBackend({
        platform: options.platform,
        uiProvider: options.uiProvider,
        pluginInvoker: options.pluginInvoker,
      });
    case 'subprocess':
      return new SubprocessBackend({
        platform: options.platform,
        runner: new SubprocessRunnerAdapter(),
        uiProvider: options.uiProvider,
      });
    case 'worker-pool':
      return new WorkerPoolBackend({
        platform: options.platform,
        platformTransport: options.platformTransport,
        uiProvider: options.uiProvider,
        min: options.workerPool?.min ?? 2,
        max: options.workerPool?.max ?? 10,
        maxRequestsPerWorker: options.workerPool?.maxRequestsPerWorker ?? 1000,
        maxUptimeMsPerWorker: options.workerPool?.maxUptimeMsPerWorker ?? 30 * 60 * 1000,
        maxConcurrentPerPlugin: options.workerPool?.maxConcurrentPerPlugin,
        warmup: options.workerPool?.warmup ?? { mode: 'none', topN: 5, maxHandlers: 20 },
      });
    default:
      return new InProcessBackend({
        platform: options.platform,
        uiProvider: options.uiProvider,
        pluginInvoker: options.pluginInvoker,
      });
  }
}
