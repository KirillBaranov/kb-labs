import type { IInvoke, InvokeRequest, InvokeResponse } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport.js';
import type { InvokeIPCOperation } from '../ipc/adapter-contract.js';
import { RemoteAdapter } from './remote-adapter.js';

/** Transparent IPC proxy for cross-plugin invocation. */
export class InvokeProxy extends RemoteAdapter<IInvoke, InvokeIPCOperation> implements IInvoke {
  constructor(transport: ITransport) {
    super('invoke', transport);
  }

  async call<T = unknown>(request: InvokeRequest): Promise<InvokeResponse<T>> {
    return (await this.callRemote('call', [request])) as InvokeResponse<T>;
  }

  async isAvailable(pluginId: string, command?: string): Promise<boolean> {
    return (await this.callRemote('isAvailable', [pluginId, command])) as boolean;
  }
}

export function createInvokeProxy(transport: ITransport): InvokeProxy {
  return new InvokeProxy(transport);
}
