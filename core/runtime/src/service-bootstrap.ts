/**
 * @module @kb-labs/core-runtime/service-bootstrap
 *
 * Shared bootstrap utility for KB Labs server processes.
 * Eliminates duplication of .env loading + platform init across
 * rest-api, workflow-daemon, gateway, and future services.
 *
 * @example
 * ```typescript
 * import { createServiceBootstrap, platform } from '@kb-labs/core-runtime';
 *
 * await createServiceBootstrap({ appId: 'my-service', repoRoot });
 * // platform.cache, platform.logger etc. are now ready
 * ```
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { initPlatform, resetPlatform } from './loader.js';
import { platform, type PlatformLifecycleHooks, type PlatformLifecycleContext, type PlatformLifecyclePhase } from './container.js';
import { isDisposable } from '@kb-labs/core-platform/adapters';
import { loadPlatformConfig } from './config-loader.js';


// ─── Module state ────────────────────────────────────────────────────────────

let _initialized = false;
const _registeredHooks = new Set<string>();
/** Prevents duplicate SIGTERM/SIGINT handler registration across multiple createServiceBootstrap() calls. */
let _signalHandlersRegistered = false;
let _platformRoot: string | undefined;
let _projectRoot: string | undefined;


// ─── Internal helpers ─────────────────────────────────────────────────────────

function _loadEnvFile(dir: string): void {
  const envPath = path.join(dir, '.env');
  if (!existsSync(envPath)) { return; }
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) { continue; }
      const eq = trimmed.indexOf('=');
      if (eq === -1) { continue; }
      const key = trimmed.substring(0, eq).trim();
      const val = trimmed.substring(eq + 1).trim()
        .replace(/^["'](.*?)["']$/, '$1')
        .replace(/^`(.*?)`$/, '$1');
      if (key && !(key in process.env)) { process.env[key] = val; }
    }
  } catch { /* silently ignore — not critical for service operation */ }
}

/**
 * Register SIGTERM and SIGINT handlers that trigger platform.shutdown() exactly once.
 *
 * Uses process.once() so that a second signal received while shutdown is already
 * in progress does not start a second shutdown sequence concurrently.
 *
 * The _signalHandlersRegistered module-level flag prevents duplicate registration
 * across multiple createServiceBootstrap() calls (idempotent; reset by resetServiceBootstrap()).
 *
 * Shutdown sequence triggered here:
 *   1. platform.shutdown() → emits 'beforeShutdown' lifecycle phase
 *      (onBeforeShutdown hook logs which IDisposable adapters are about to be disposed)
 *   2. platform.shutdown() → disposes all adapters in reverse load order
 *      (container.ts lines 816–843: checks close() → dispose() → shutdown())
 *   3. platform.shutdown() → emits 'shutdown' lifecycle phase
 *      (onShutdown hook logs "Platform lifecycle shutdown")
 *   4. process.exit(0)
 */
function _ensureSignalHandlers(appId: string): void {
  if (_signalHandlersRegistered) { return; }
  _signalHandlersRegistered = true;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[${appId}:platform] Received ${signal}, shutting down gracefully...\n`);
    try {
      // platform.shutdown() handles the full disposal sequence internally:
      // beforeShutdown hooks → adapter close/dispose → shutdown hooks.
      await platform.shutdown();
    } catch (err) {
      process.stderr.write(
        `[${appId}:platform] Shutdown error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      process.exit(0);
    }
  };

  // process.once() — NOT process.on() — so a second signal during an in-flight
  // shutdown does not spawn a concurrent shutdown sequence.
  process.once('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
  process.once('SIGINT',  () => { void gracefulShutdown('SIGINT'); });
}


function _ensureHooksRegistered(appId: string): void {
  if (_registeredHooks.has(appId)) { return; }

  const hooks: PlatformLifecycleHooks = {
    onStart: (ctx: PlatformLifecycleContext) => {
      process.stderr.write(`[${appId}:platform] lifecycle:start cwd=${ctx.cwd}\n`);
    },
    onReady: (ctx: PlatformLifecycleContext) => {
      platform.logger.info('Platform lifecycle ready', { app: appId, durationMs: ctx.metadata?.durationMs });
    },
    onBeforeShutdown: () => {
      // This hook fires BEFORE adapters are disposed (container.ts line 767).
      // Identify which adapters implement IDisposable so we can log them now,
      // while they are still alive. The actual disposal happens in container.shutdown()
      // between lines 816–843 — after all onBeforeShutdown hooks complete.
      const disposableAdapters = platform.listAdapters().filter(
        (key) => isDisposable(platform.getAdapter(key)),
      );
      platform.logger.info('Platform lifecycle beforeShutdown', {
        app: appId,
        disposableAdapters,
      });
    },
    onShutdown: () => {
      // This hook fires AFTER all adapters have been disposed (container.ts line 846).
      platform.logger.info('Platform lifecycle shutdown', { app: appId });
    },
    onError: (error: unknown, phase: PlatformLifecyclePhase) => {
      process.stderr.write(`[${appId}:platform] lifecycle:error phase=${phase} ${error instanceof Error ? error.message : String(error)}\n`);
    },
  };

  platform.registerLifecycleHooks(appId, hooks);
  _registeredHooks.add(appId);
}


// ─── Public API ───────────────────────────────────────────────────────────────

export interface ServiceBootstrapOptions {
  /** Unique identifier for this service — used in log messages and lifecycle hooks. */
  appId: string;
  /** Monorepo root directory: .env is loaded from here, kb.config.json is searched from here. */
  repoRoot: string;
  /**
   * Whether to store the raw config in `globalThis.__KB_RAW_CONFIG__` for `useConfig()`.
   * @default true
   */
  storeRawConfig?: boolean;
  /**
   * Whether to load `.env` from repoRoot before platform init.
   * @default true
   */
  loadEnv?: boolean;
}

/**
 * Shared bootstrap for KB Labs service processes.
 *
 * 1. Loads `.env` from `repoRoot` (unless `loadEnv: false`)
 * 2. Reads `platform` config from `.kb/kb.config.json`
 * 3. Calls `initPlatform()` — falls back to NoOp adapters on error
 * 4. Registers lifecycle hooks keyed by `appId`
 *
 * Idempotent: subsequent calls return immediately if already initialized.
 * Returns the `platform` singleton for convenience.
 */
export async function createServiceBootstrap(
  options: ServiceBootstrapOptions,
): Promise<typeof platform> {
  const { appId, repoRoot, storeRawConfig = true, loadEnv = true } = options;

  _ensureHooksRegistered(appId);
  // Register SIGTERM/SIGINT → platform.shutdown() once per process lifetime.
  // Must be called after _ensureHooksRegistered so the onBeforeShutdown hook
  // is already registered before the first signal can arrive.
  _ensureSignalHandlers(appId);


  if (_initialized) {
    return platform;
  }

  try {
    // Resolve roots and load layered config (platform defaults + project
    // overrides) via the shared helper. loadPlatformConfig also handles .env
    // loading, so we don't need to do it here — just pass loadEnvFile through.
    const {
      platformConfig,
      rawConfig,
      platformRoot,
      projectRoot,
      sources,
    } = await loadPlatformConfig({
      startDir: repoRoot,
      loadEnvFile: loadEnv,
    });

    if (storeRawConfig && rawConfig) {
      (globalThis as Record<string, unknown>).__KB_RAW_CONFIG__ = rawConfig;
    }

    _platformRoot = platformRoot;
    _projectRoot = projectRoot;

    // Relative adapter paths (e.g. ".kb/database/kb.sqlite") must resolve
    // against the project root, not the platform installation.
    // Pass platformRoot so adapter discovery reads marketplace.lock from
    // the right location when platform is installed separately.
    await initPlatform(
      platformConfig,
      projectRoot,
      undefined,
      platformRoot !== projectRoot ? platformRoot : undefined,
    );
    _initialized = true;

    const hasConfig =
      !!sources.platformDefaults || !!sources.projectConfig;
    if (!hasConfig) {
      process.stderr.write(
        `[${appId}:platform] No kb.config.json found, using NoOp adapters\n`,
      );
    }

    platform.logger.info('Platform adapters initialized', {
      app: appId,
      adapters: Object.keys(platformConfig.adapters ?? {}),
      platformRoot,
      projectRoot,
      sources,
    });
  } catch (error) {
    process.stderr.write(
      `[${appId}:platform] Initialization failed, using NoOp adapters: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    await initPlatform({ adapters: {} }, repoRoot);
    _initialized = true;
  }

  return platform;
}

/**
 * Returns the resolved platform root after createServiceBootstrap() has been called.
 * In installed mode this is the platform installation directory (e.g. /Users/foo/kb-platform).
 * In dev-monorepo mode it equals the project root.
 * Returns undefined before bootstrap completes.
 */
export function getPlatformRoot(): string | undefined {
  return _platformRoot;
}

/**
 * Returns the resolved project root after createServiceBootstrap() has been called.
 * Returns undefined before bootstrap completes.
 */
export function getProjectRoot(): string | undefined {
  return _projectRoot;
}

/**
 * Reset bootstrap state — for use in tests only.
 * Also calls `resetPlatform()` from the loader.
 * @internal
 */
export function resetServiceBootstrap(): void {
  _initialized = false;
  _registeredHooks.clear();
  // Reset signal handler flag so test suites calling resetServiceBootstrap()
  // get a clean slate and can re-register handlers in subsequent bootstrap calls.
  _signalHandlersRegistered = false;
  _platformRoot = undefined;
  _projectRoot = undefined;
  resetPlatform();
}


/**
 * Load .env file from the given directory into process.env.
 * Does not overwrite already-set variables.
 * Useful for services that need env vars available before platform init
 * (e.g., before loadRestApiConfig() reads KB_REST_* overrides).
 */
export function loadEnvFromRoot(repoRoot: string): void {
  _loadEnvFile(repoRoot);
}
