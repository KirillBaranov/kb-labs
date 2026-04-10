/**
 * @module @kb-labs/core-platform/adapters/config
 * Configuration adapter interface
 *
 * Provides access to kb.config.json with product-specific extraction.
 * Supports both Profiles v2 and legacy config structures.
 */

/**
 * Configuration adapter interface.
 *
 * Provides product-specific configuration from kb.config.json.
 * This adapter is available through platform.config and can be accessed
 * via IPC in child processes.
 *
 * @example
 * ```typescript
 * // Get Mind product config
 * const mindConfig = await platform.config.getConfig('mind');
 * console.log(mindConfig.scopes);
 *
 * // Get Workflow config with specific profile
 * const workflowConfig = await platform.config.getConfig('workflow', 'production');
 * ```
 */
export interface IConfig {
  /**
   * Get product-specific configuration.
   *
   * Extracts configuration for the specified product from kb.config.json.
   * Supports both Profiles v2 structure and legacy structure.
   *
   * **Profiles v2 structure:**
   * ```json
   * {
   *   "profiles": [
   *     {
   *       "id": "default",
   *       "products": {
   *         "mind": { "scopes": [...] },
   *         "workflow": { "maxConcurrency": 10 }
   *       }
   *     }
   *   ]
   * }
   * ```
   *
   * **Legacy structure:**
   * ```json
   * {
   *   "knowledge": { "scopes": [...] },  // for "mind" product
   *   "workflow": { "maxConcurrency": 10 }
   * }
   * ```
   *
   * @param productId - Product identifier (e.g., 'mind', 'workflow', 'plugins')
   * @param profileId - Profile identifier (defaults to 'default' or KB_PROFILE env var)
   * @returns Product-specific config or undefined if not found
   */
  getConfig(productId: string, profileId?: string): Promise<any>;

  /**
   * Get raw kb.config.json data.
   *
   * Returns the entire config object without any product/profile extraction.
   * Useful for custom parsing or when you need access to multiple products.
   *
   * @returns Raw config object or undefined if not loaded
   */
  getRawConfig(): Promise<any>;
}
