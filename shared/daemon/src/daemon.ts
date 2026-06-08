import { createHash } from 'node:crypto';
import { findRepoRoot } from '@kb-labs/core-sys';
import { loadEnvFromRoot } from '@kb-labs/core-runtime';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { ILogger } from '@kb-labs/core-platform';

export interface DaemonContext {
  platform: PlatformContainer;
  logger: ILogger;
  port: number;
  host: string;
  /**
   * Repository root resolved via findRepoRoot(process.cwd()). Services should
   * use this (not process.cwd()) for plugin/workflow discovery so they behave
   * correctly when launched from a subdirectory.
   */
  repoRoot: string;
}

export interface DaemonConfig {
  appId: string;
  defaultPort: number;
  portEnvVar: string;
  defaultHost?: string;
  hostEnvVar?: string;
  /**
   * Called after platform is ready. Returns a teardown callback.
   * The callback is invoked before platform.shutdown() on SIGTERM/SIGINT.
   */
  setup(ctx: DaemonContext): Promise<() => Promise<void>>;
}

/**
 * Universal process-lifecycle runner for KB Labs daemon services.
 *
 * Handles: env loading, platform init, port/host resolution,
 * setup invocation, and graceful SIGTERM/SIGINT shutdown.
 *
 * @param config - Service-specific configuration
 * @param platformBootstrap - DI factory for platform (keeps makeAssemblyHook out of this package)
 *   Example: (appId, repoRoot) => createServiceBootstrap({ appId, repoRoot, assemblyHook: makeAssemblyHook() })
 */
export async function runDaemon(
  config: DaemonConfig,
  platformBootstrap: (appId: string, repoRoot: string) => Promise<PlatformContainer>,
): Promise<void> {
  const repoRoot = await findRepoRoot(process.cwd());
  loadEnvFromRoot(repoRoot);

  // Ensure KB_SOCKET_HASH is set before interpolateConfig() runs inside platformBootstrap.
  // kb-dev sets it via spawnEnv() for all managed services (including gateway, rest-api).
  // For manual starts (dev scripts, local testing), derive it the same way kb-dev does —
  // from the project dir (KB_PROJECT_ROOT), falling back to repoRoot — so a manually
  // started service lands in the same /tmp/kb-<hash>/ dir as kb-dev-managed peers.
  if (!process.env.KB_SOCKET_HASH) {
    const hashRoot = process.env.KB_PROJECT_ROOT ?? repoRoot;
    process.env.KB_SOCKET_HASH = createHash('md5').update(hashRoot).digest('hex').slice(0, 8);
  }

  const platform = await platformBootstrap(config.appId, repoRoot);
  const logger = platform.logger.child({
    serviceId: config.appId,
    service: 'bootstrap',
  });

  // KB_SERVICE_PORT is the uniform port override injected by kb-dev (the
  // possibly port-base-shifted port from devservices.yaml). It takes precedence
  // over the per-service env var and the compiled default, so a single contract
  // shifts every daemon's bind for isolated environments. Falls back to the
  // service-specific env var, then the default.
  const port = process.env.KB_SERVICE_PORT
    ? parseInt(process.env.KB_SERVICE_PORT, 10)
    : process.env[config.portEnvVar]
      ? parseInt(process.env[config.portEnvVar]!, 10)
      : config.defaultPort;

  const host = (config.hostEnvVar && process.env[config.hostEnvVar])
    ? process.env[config.hostEnvVar]!
    : (config.defaultHost ?? '0.0.0.0');

  logger.info(`${config.appId}: starting`, { port, host } as Record<string, unknown>);

  const teardown = await config.setup({ platform, logger, port, host, repoRoot });

  // Guard against a second signal (e.g. SIGTERM then Ctrl-C) re-running teardown
  // against already-closed resources.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn(`${config.appId}: received ${signal}`);
    await teardown();
    await platform.shutdown();
    logger.info(`${config.appId}: stopped`);
    process.exit(0);
  };

  process.on('SIGTERM', async () => { await shutdown('SIGTERM'); });
  process.on('SIGINT', async () => { await shutdown('SIGINT'); });
}
