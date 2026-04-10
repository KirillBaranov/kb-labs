/**
 * @module @kb-labs/core-platform/adapters/invoke
 * Inter-plugin invocation adapter interface.
 */

/**
 * Request to invoke another plugin command.
 */
export interface InvokeRequest {
  /** Target plugin ID (e.g., 'mind-engine') */
  pluginId: string;
  /** Command to execute (e.g., 'rag-query') */
  command: string;
  /** Input payload for the command */
  input?: unknown;
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from plugin invocation.
 */
export interface InvokeResponse<T = unknown> {
  /** Whether the invocation succeeded */
  success: boolean;
  /** Result data (if success) */
  data?: T;
  /** Error message (if failure) */
  error?: string;
  /** Execution metadata (duration, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Inter-plugin invocation adapter.
 *
 * Allows plugins to call commands from other plugins.
 * The runtime enforces permissions and sandboxing.
 *
 * @example
 * ```typescript
 * // In plugin A, call plugin B
 * const response = await ctx.platform.invoke?.call({
 *   pluginId: 'plugin-b',
 *   command: 'process-data',
 *   input: { data: [...] },
 * });
 *
 * if (response?.success) {
 *   console.log(response.data);
 * }
 * ```
 */
export interface IInvoke {
  /**
   * Invoke a command in another plugin.
   *
   * @param request - Invocation request
   * @returns Response with result or error
   */
  call<T = unknown>(request: InvokeRequest): Promise<InvokeResponse<T>>;

  /**
   * Check if a plugin/command is available for invocation.
   *
   * @param pluginId - Target plugin ID
   * @param command - Command name (optional, checks plugin availability)
   * @returns True if available
   */
  isAvailable(pluginId: string, command?: string): Promise<boolean>;
}
