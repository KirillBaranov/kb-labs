/**
 * Lifecycle Hook Helpers
 *
 * Optional helpers for plugin lifecycle hooks (setup, destroy, upgrade).
 * You can always use plain functions - this is just convenience.
 *
 * @example
 * ```typescript
 * import { defineSetupHandler } from '@kb-labs/shared-command-kit';
 *
 * export const setup = defineSetupHandler({
 *   name: 'mind:setup',
 *   workspace: {
 *     directories: ['.kb/mind/index', '.kb/mind/cache'],
 *   },
 *   config: {
 *     'kb.config.json': {
 *       mind: { enabled: true, scopes: ['default'] },
 *     },
 *   },
 *   async handler(ctx) {
 *     ctx.log('Mind workspace initialized');
 *     return { ok: true };
 *   },
 * });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Lifecycle handler context
 */
export interface LifecycleContext {
  /** Output directory (plugin workspace root) */
  outdir: string;
  /** Plugin ID */
  pluginId: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Logger */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  /** Environment getter */
  env?: (key: string) => string | undefined;
}

/**
 * Workspace setup configuration
 */
export interface WorkspaceConfig {
  /** Directories to create (relative to outdir or absolute) */
  directories?: string[];
  /** Files to create with content */
  files?: Record<string, string>;
}

/**
 * Config file updates
 */
export type ConfigUpdates = Record<string, Record<string, unknown>>;

/**
 * Setup handler definition
 */
export interface SetupHandlerDefinition {
  /** Handler name (for logging) */
  name: string;
  /** Workspace configuration (directories/files to create) */
  workspace?: WorkspaceConfig;
  /** Config file updates (will be merged with existing config) */
  config?: ConfigUpdates;
  /** Custom setup logic (optional) */
  handler?: (ctx: LifecycleContext) => Promise<{ ok: boolean; message?: string }>;
}

/**
 * Destroy handler definition
 */
export interface DestroyHandlerDefinition {
  /** Handler name (for logging) */
  name: string;
  /** Workspace cleanup (directories/files to remove) */
  workspace?: {
    /** Directories to remove */
    directories?: string[];
    /** Files to remove */
    files?: string[];
  };
  /** Config cleanup (keys to remove from config files) */
  config?: Record<string, string[]>; // file -> keys to remove
  /** Custom destroy logic (optional) */
  handler?: (ctx: LifecycleContext) => Promise<{ ok: boolean; message?: string }>;
}

/**
 * Setup handler result
 */
export interface SetupResult {
  ok: boolean;
  message?: string;
}

/**
 * Define a setup handler with declarative workspace and config setup
 *
 * @example
 * ```typescript
 * export const setup = defineSetupHandler({
 *   name: 'mind:setup',
 *   workspace: {
 *     directories: [
 *       '.kb/mind/index',
 *       '.kb/mind/cache',
 *       '.kb/mind/pack',
 *     ],
 *     files: {
 *       '.kb/mind/.gitignore': 'cache/\npack/\n',
 *     },
 *   },
 *   config: {
 *     'kb.config.json': {
 *       mind: {
 *         enabled: true,
 *         scopes: ['default'],
 *       },
 *     },
 *   },
 *   async handler(ctx) {
 *     ctx.log?.('info', 'Custom setup logic', {});
 *     return { ok: true };
 *   },
 * });
 * ```
 */
export function defineSetupHandler(
  definition: SetupHandlerDefinition
): (ctx: LifecycleContext) => Promise<SetupResult> {
  return async (ctx: LifecycleContext) => {
    const log = ctx.log || ((level: string, msg: string, meta?: Record<string, unknown>) => {
      console.log(`[${level}] ${msg}`, meta || '');
    });

    try {
      log('info', 'Setup started', { handler: definition.name, outdir: ctx.outdir });

      // 1. Create workspace directories and files
      if (definition.workspace) {
        await setupWorkspace(ctx.outdir, definition.workspace, log);
      }

      // 2. Update config files
      if (definition.config) {
        await updateConfigFiles(ctx.outdir, definition.config, log);
      }

      // 3. Run custom handler logic
      if (definition.handler) {
        const result = await definition.handler(ctx);
        if (!result.ok) {
          return result;
        }
      }

      log('info', 'Setup completed', { handler: definition.name });
      return { ok: true, message: `${definition.name} setup completed` };
    } catch (error: any) {
      log('error', 'Setup failed', {
        handler: definition.name,
        error: error.message,
        stack: error.stack,
      });
      return { ok: false, message: `Setup failed: ${error.message}` };
    }
  };
}

/**
 * Define a destroy handler with declarative cleanup
 *
 * @example
 * ```typescript
 * export const destroy = defineDestroyHandler({
 *   name: 'mind:destroy',
 *   workspace: {
 *     directories: ['.kb/mind'],
 *   },
 *   config: {
 *     'kb.config.json': ['mind'], // Remove 'mind' key
 *   },
 * });
 * ```
 */
export function defineDestroyHandler(
  definition: DestroyHandlerDefinition
): (ctx: LifecycleContext) => Promise<SetupResult> {
  return async (ctx: LifecycleContext) => {
    const log = ctx.log || ((level: string, msg: string, meta?: Record<string, unknown>) => {
      console.log(`[${level}] ${msg}`, meta || '');
    });

    try {
      log('info', 'Destroy started', { handler: definition.name, outdir: ctx.outdir });

      // 1. Clean up config files
      if (definition.config) {
        await cleanupConfigFiles(ctx.outdir, definition.config, log);
      }

      // 2. Remove workspace directories and files
      if (definition.workspace) {
        await cleanupWorkspace(ctx.outdir, definition.workspace, log);
      }

      // 3. Run custom handler logic
      if (definition.handler) {
        const result = await definition.handler(ctx);
        if (!result.ok) {
          return result;
        }
      }

      log('info', 'Destroy completed', { handler: definition.name });
      return { ok: true, message: `${definition.name} destroy completed` };
    } catch (error: any) {
      log('error', 'Destroy failed', {
        handler: definition.name,
        error: error.message,
        stack: error.stack,
      });
      return { ok: false, message: `Destroy failed: ${error.message}` };
    }
  };
}

/**
 * Setup workspace directories and files
 */
async function setupWorkspace(
  outdir: string,
  config: WorkspaceConfig,
  log: (level: 'error' | 'info' | 'debug' | 'warn', msg: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  // Create directories
  if (config.directories) {
    for (const dir of config.directories) {
      const dirPath = path.resolve(outdir, dir);
      await fs.mkdir(dirPath, { recursive: true });
      log('debug', 'Created directory', { path: dirPath });
    }
  }

  // Create files
  if (config.files) {
    for (const [filePath, content] of Object.entries(config.files)) {
      const fullPath = path.resolve(outdir, filePath);
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      log('debug', 'Created file', { path: fullPath });
    }
  }
}

/**
 * Update config files (merge with existing config)
 */
async function updateConfigFiles(
  outdir: string,
  updates: ConfigUpdates,
  log: (level: 'error' | 'info' | 'debug' | 'warn', msg: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  for (const [configFile, configUpdates] of Object.entries(updates)) {
    const configPath = path.resolve(outdir, configFile);

    // Read existing config or create empty
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      const content = await fs.readFile(configPath, 'utf-8');
      try {
        config = JSON.parse(content);
      } catch (error) {
        log('warn', 'Failed to parse existing config, starting fresh', { path: configPath });
      }
    }

    // Merge updates
    config = { ...config, ...configUpdates };

    // Write updated config
    const dirPath = path.dirname(configPath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    log('debug', 'Updated config file', { path: configPath });
  }
}

/**
 * Cleanup workspace directories and files
 */
async function cleanupWorkspace(
  outdir: string,
  config: DestroyHandlerDefinition['workspace'],
  log: (level: 'error' | 'info' | 'debug' | 'warn', msg: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  if (!config) {return;}

  // Remove files first
  if (config.files) {
    for (const file of config.files) {
      const filePath = path.resolve(outdir, file);
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
        log('debug', 'Removed file', { path: filePath });
      }
    }
  }

  // Remove directories
  if (config.directories) {
    for (const dir of config.directories) {
      const dirPath = path.resolve(outdir, dir);
      if (existsSync(dirPath)) {
        await fs.rm(dirPath, { recursive: true, force: true });
        log('debug', 'Removed directory', { path: dirPath });
      }
    }
  }
}

/**
 * Cleanup config files (remove keys)
 */
async function cleanupConfigFiles(
  outdir: string,
  cleanups: Record<string, string[]>,
  log: (level: 'error' | 'info' | 'debug' | 'warn', msg: string, meta?: Record<string, unknown>) => void
): Promise<void> {
  for (const [configFile, keysToRemove] of Object.entries(cleanups)) {
    const configPath = path.resolve(outdir, configFile);

    if (!existsSync(configPath)) {
      continue;
    }

    // Read config
    const content = await fs.readFile(configPath, 'utf-8');
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(content);
    } catch (error) {
      log('warn', 'Failed to parse config for cleanup', { path: configPath });
      continue;
    }

    // Remove keys
    for (const key of keysToRemove) {
      delete config[key];
    }

    // Write updated config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    log('debug', 'Cleaned up config file', { path: configPath, removed: keysToRemove });
  }
}
