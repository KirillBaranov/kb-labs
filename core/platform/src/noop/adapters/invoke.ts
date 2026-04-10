/**
 * @module @kb-labs/core-platform/noop/adapters/invoke
 * NoOp implementation of IInvoke.
 */

import type { IInvoke, InvokeRequest, InvokeResponse } from '../../adapters/invoke.js';

/**
 * NoOp invoke implementation.
 * Returns error for all calls - invoke requires runtime to be configured.
 */
export class NoOpInvoke implements IInvoke {
  async call<T = unknown>(_request: InvokeRequest): Promise<InvokeResponse<T>> {
    return {
      success: false,
      error: 'Invoke not configured. Inter-plugin calls are not available.',
    };
  }

  async isAvailable(_pluginId: string, _command?: string): Promise<boolean> {
    return false;
  }
}
