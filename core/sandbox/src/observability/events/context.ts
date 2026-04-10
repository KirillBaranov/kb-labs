/**
 * @module @kb-labs/core-sandbox/observability/events/context
 * Operation context management for event correlation
 */

import type { ExecutionContext } from './schema';

/**
 * Create execution context for operation
 */
export function createExecutionContext(options: {
  pluginId: string;
  pluginVersion: string;
  operationId?: string;
  parentOperationId?: string;
  sessionId?: string;
  userId?: string;
}): ExecutionContext {
  return {
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
    operationId: options.operationId || crypto.randomUUID(),
    parentOperationId: options.parentOperationId,
    sessionId: options.sessionId,
    userId: options.userId,
    pid: process.pid,
  };
}

/**
 * Context manager for async operations
 */
export class OperationContext {
  private static contexts: Map<string, ExecutionContext> = new Map();

  /**
   * Start new operation context
   */
  static start(context: ExecutionContext): void {
    this.contexts.set(context.operationId, context);
  }

  /**
   * Get current operation context
   */
  static get(operationId: string): ExecutionContext | undefined {
    return this.contexts.get(operationId);
  }

  /**
   * End operation context
   */
  static end(operationId: string): void {
    this.contexts.delete(operationId);
  }

  /**
   * Create child context
   */
  static createChild(parentOperationId: string): ExecutionContext | null {
    const parent = this.contexts.get(parentOperationId);
    if (!parent) {
      return null;
    }

    const child: ExecutionContext = {
      ...parent,
      operationId: crypto.randomUUID(),
      parentOperationId,
    };

    this.contexts.set(child.operationId, child);
    return child;
  }
}
