import { randomUUID } from 'node:crypto';
import type {
  GovernedProcessRequest,
  IProcessExecutor,
  ProcessBackendCapabilities,
  ProcessResult,
} from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport.js';
import { RemoteAdapter } from './remote-adapter.js';

/**
 * The process backend owns the real deadline. IPC only needs to wait long
 * enough for the backend to terminate the process and return its result.
 * Keeping this separate from the generic adapter timeout prevents long shell
 * commands from being truncated by the 30s adapter default.
 */
const PROCESS_RPC_GRACE_MS = 5_000;
const CONTROL_RPC_TIMEOUT_MS = 5_000;
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Worker-side process executor. The worker only serializes the request; the
 * parent execution host owns admission, OS spawning, limits, and accounting.
 */
export class ProcessExecutorProxy extends RemoteAdapter<IProcessExecutor> implements IProcessExecutor {
  constructor(transport: ITransport) { super('processExecutor', transport); }

  capabilities(): ProcessBackendCapabilities {
    return {
      platform: 'other', processGroups: false, hardMemoryLimit: false,
      hardCpuLimit: false, processTreeAccounting: false, maxProcesses: false,
    };
  }

  async execute(request: GovernedProcessRequest): Promise<ProcessResult> {
    const processId = request.processId ?? randomUUID();
    const { signal, ...serializableRequest } = request;
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      void this.cancel(processId, 'cancelled');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const processTimeout = request.limits.timeoutMs + (request.limits.graceMs ?? 1_000);
      const rpcTimeout = Math.min(MAX_TIMER_MS, processTimeout + PROCESS_RPC_GRACE_MS);
      return await this.callRemote('execute', [{ ...serializableRequest, processId }], rpcTimeout) as ProcessResult;
    } catch (error) {
      // If the response channel fails, the host may still have an active
      // process. Cancellation is best-effort; the host-side deadline remains
      // authoritative and guarantees cleanup even if the channel is gone.
      void this.cancel(processId, 'cancelled').catch(() => undefined);
      throw error;
    } finally {
      if (!cancelled) { signal?.removeEventListener('abort', onAbort); }
    }
  }

  async cancel(processId: string, reason: 'cancelled' | 'shutdown' = 'cancelled'): Promise<void> {
    await this.callRemote('cancel', [processId, reason], CONTROL_RPC_TIMEOUT_MS);
  }

  async shutdown(): Promise<void> {
    await this.callRemote('shutdown', [], CONTROL_RPC_TIMEOUT_MS);
  }
}
