import { createHash } from 'node:crypto';
import { findRepoRoot } from '@kb-labs/core-sys';
import { loadEnvFromRoot } from '@kb-labs/core-runtime';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { ILogger, IServiceTransport } from '@kb-labs/core-platform';

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
  /**
   * serviceId in the transport map (declarative network). Defaults to appId.
   * Set explicitly when they differ. The daemon binds the port the transport
   * publishes for this serviceId — keeping bind and route consistent (incl.
   * any KB_NET_OFFSET shift).
   */
  serviceId?: string;
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

  // Bind port from the transport (the single declarative network source): the
  // daemon listens on exactly the port the transport publishes for its
  // serviceId, so bind and route stay consistent — including any KB_NET_OFFSET
  // shift. Socket services resolve their bind via KB_SOCKET_PATH (setup →
  // getListenOptions), so listenAddress returns socketPath and we keep the
  // fallback port. Services NOT in the transport map (e.g. state-daemon — not
  // gateway-routed) are treated as edges: the fallback applies KB_NET_OFFSET
  // directly, so the one offset knob still shifts their bind. Host stays the
  // daemon's own concern (offset never affects host).
  const serviceId = config.serviceId ?? config.appId;
  const transport = platform.getAdapter<IServiceTransport>('serviceTransport');
  const addr = transport?.listenAddress?.(serviceId);
  const netOffset = Number(process.env.KB_NET_OFFSET) || 0;
  const port = addr && 'port' in addr
    ? addr.port
    : (process.env[config.portEnvVar]
        ? parseInt(process.env[config.portEnvVar]!, 10)
        : config.defaultPort) + netOffset;

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
