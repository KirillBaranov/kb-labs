/**
 * @module @kb-labs/core-platform/inmemory/adapters/invoke
 *
 * In-memory cross-plugin invocation registry.
 *
 * Honest in a single process: plugins register handlers, callers reach
 * them through the same registry. Cross-process calls are NOT served
 * here — those go through the real adapter (HTTP/IPC).
 */

import type {
  IInvoke,
  InvokeRequest,
  InvokeResponse,
} from '../../adapters/invoke.js';

export type InvokeHandler = (input: unknown) => Promise<unknown> | unknown;

/**
 * In-memory implementation of `IInvoke`.
 *
 * Use `register(pluginId, command, handler)` to wire up a handler from
 * plugin code; `call()` dispatches synchronously through a Map lookup.
 * Errors thrown by handlers become `{success: false, error}` responses.
 */
export class InMemoryInvoke implements IInvoke {
  private readonly handlers = new Map<string, InvokeHandler>();

  private key(pluginId: string, command: string): string {
    return `${pluginId}::${command}`;
  }

  register(pluginId: string, command: string, handler: InvokeHandler): void {
    this.handlers.set(this.key(pluginId, command), handler);
  }

  unregister(pluginId: string, command: string): void {
    this.handlers.delete(this.key(pluginId, command));
  }

  async call<T = unknown>(request: InvokeRequest): Promise<InvokeResponse<T>> {
    const handler = this.handlers.get(this.key(request.pluginId, request.command));
    if (!handler) {
      return {
        success: false,
        error: `No handler registered for ${request.pluginId}::${request.command}`,
      };
    }
    const started = Date.now();
    try {
      const data = (await handler(request.input)) as T;
      return {
        success: true,
        data,
        metadata: { durationMs: Date.now() - started },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        metadata: { durationMs: Date.now() - started },
      };
    }
  }

  async isAvailable(pluginId: string, command?: string): Promise<boolean> {
    if (command) {
      return this.handlers.has(this.key(pluginId, command));
    }
    // No specific command — return true if ANY command is registered for this plugin.
    for (const key of this.handlers.keys()) {
      if (key.startsWith(`${pluginId}::`)) { return true; }
    }
    return false;
  }
}
