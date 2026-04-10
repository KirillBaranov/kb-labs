/**
 * @module @kb-labs/cli-contracts
 * System command context - for KB Labs official commands with full privileges
 */

// For now, Output is just a simple interface
// In the future we might import from @kb-labs/core-sys
export interface Output {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
  write?(message: string): void;
}

/**
 * Context for system commands (main process, full privileges)
 *
 * Used by: defineSystemCommand()
 * Examples: kb workflow:run, kb plugins:list
 *
 * System commands run in the main process WITHOUT sandbox isolation.
 * They have full access to the filesystem, environment, and network.
 *
 * @example
 * ```typescript
 * import { defineSystemCommand, type SystemContext } from '@kb-labs/shared-command-kit';
 *
 * export const myCommand = defineSystemCommand({
 *   name: 'my:command',
 *   description: 'My system command',
 *   flags: {},
 *   async handler(ctx: SystemContext, argv, flags) {
 *     // Main process - full system access
 *     ctx.output.info('Running command...');
 *
 *     // Direct filesystem access (Node.js fs)
 *     const fs = await import('fs/promises');
 *     await fs.readFile(ctx.cwd + '/file.txt', 'utf-8');
 *
 *     // Direct environment access
 *     console.log(ctx.env.HOME);
 *
 *     return { ok: true };
 *   }
 * });
 * ```
 */
export interface SystemContext {
  /**
   * Current working directory
   */
  readonly cwd: string;

  /**
   * Repository root (detected via .git or explicit)
   */
  readonly repoRoot?: string;

  /**
   * Environment variables (process.env)
   */
  readonly env: NodeJS.ProcessEnv;

  /**
   * User configuration from kb.config.json
   */
  readonly config?: Record<string, any>;

  /**
   * Profile ID from --profile flag or KB_PROFILE env var
   *
   * Priority: --profile flag > KB_PROFILE env var > default
   *
   * @example
   * ```bash
   * kb --profile strict ai-review:check
   * KB_PROFILE=ci-strict kb workflow:run
   * ```
   */
  readonly profileId?: string;

  /**
   * Output interface for terminal messages
   */
  readonly output: Output;
}
