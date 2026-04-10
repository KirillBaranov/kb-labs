/**
 * @module @kb-labs/core-sandbox/runner
 * Sandbox runner interface
 */

import type {
  HandlerRef,
  ExecutionContext,
  ExecutionResult,
} from '../types/index';

/**
 * Sandbox runner - executes handlers in isolated environment
 */
export interface SandboxRunner {
  /**
   * Run handler in sandbox
   * @param handler - Handler reference
   * @param input - Input data
   * @param ctx - Execution context
   * @returns Execution result
   */
  run<TInput, TOutput>(
    handler: HandlerRef,
    input: TInput,
    ctx: ExecutionContext
  ): Promise<ExecutionResult<TOutput>>;

  /**
   * Dispose runner and cleanup resources
   */
  dispose(): Promise<void>;
}

