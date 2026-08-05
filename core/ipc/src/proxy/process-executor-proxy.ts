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
      return await this.callRemote('execute', [{ ...serializableRequest, processId }]) as ProcessResult;
    } finally {
      if (!cancelled) { signal?.removeEventListener('abort', onAbort); }
    }
  }

  async cancel(processId: string, reason: 'cancelled' | 'shutdown' = 'cancelled'): Promise<void> {
    await this.callRemote('cancel', [processId, reason]);
  }

  async shutdown(): Promise<void> {
    await this.callRemote('shutdown', []);
  }
}
