import { logDiagnosticEvent } from '@kb-labs/core-platform';
import { platform, createServiceBootstrap, getPlatformRoot } from '@kb-labs/core-runtime';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import type { IHostStore } from '@kb-labs/gateway-contracts';
import type { ISQLDatabase } from '@kb-labs/core-platform';
import { SqliteHostStore } from '@kb-labs/gateway-core';
import { loadGatewayConfig } from './config.js';
import { createServer } from './server.js';
import { HostRegistry } from './hosts/registry.js';

export async function bootstrap(repoRoot: string = process.cwd()): Promise<void> {
  // 1. Initialize platform (loads .env + adapters from kb.config.json)
  await createServiceBootstrap({ appId: 'gateway', repoRoot });

  const logger = createCorrelatedLogger(platform.logger, {
    serviceId: 'gateway',
    logsSource: 'gateway',
    layer: 'gateway',
    service: 'bootstrap',
    operation: 'gateway.bootstrap',
  });
  logger.info('Platform initialized', { repoRoot });

  // 2. Load gateway config — reads gateway.upstreams from kb.config.json (project),
  // falling back to the platform installation config in installed mode.
  const config = await loadGatewayConfig(repoRoot, getPlatformRoot());
  logger.info('Gateway config loaded', {
    port: config.port,
    upstreams: Object.keys(config.upstreams),
  });

  // 3. Create persistent host store (SQLite if available, otherwise cache-only)
  let hostStore: IHostStore | undefined;
  const db = platform.getAdapter<ISQLDatabase>('sqlDatabase');
  if (db) {
    hostStore = new SqliteHostStore(db);
    logger.info('Host store: SQLite (persistent)');
  } else {
    logger.warn('Host store: none (cache-only, hosts will be lost on restart)');
  }

  // 4. Create host registry with cache + store
  const registry = new HostRegistry(platform.cache, hostStore);

  // 5. Restore persisted hosts into cache (best-effort — cache may be unavailable on cold start)
  let restoredCount = 0;
  try {
    restoredCount = await registry.restore();
  } catch (error) {
    logDiagnosticEvent(platform.logger, {
      domain: 'registry',
      event: 'gateway.hosts.restore',
      level: 'error',
      reasonCode: 'registry_restore_failed',
      message: 'Failed to restore gateway host registry',
      outcome: 'failed',
      error: error instanceof Error ? error : new Error(String(error)),
      serviceId: 'gateway',
      evidence: {
        persistentStore: !!hostStore,
      },
    });
    // Non-fatal: gateway can start without restored state; hosts will re-register on reconnect
  }
  if (restoredCount > 0) {
    logger.info('Restored hosts from store', { count: restoredCount });
  }

  // 6. Seed static tokens into cache so resolveToken() accepts them
  for (const [token, entry] of Object.entries(config.staticTokens)) {
    await platform.cache.set(`host:token:${token}`, entry);
    logger.info('Static token seeded', { hostId: entry.hostId, namespaceId: entry.namespaceId });
  }

  // 7. Build JWT config — secret required; no fallback in production.
  const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
  const jwtSecret = process.env.GATEWAY_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!jwtSecret && isProduction) {
    throw new Error(
      'GATEWAY_JWT_SECRET must be set in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    );
  }
  if (!jwtSecret) {
    logger.warn('GATEWAY_JWT_SECRET not set — using insecure default (dev only, never use in production!)');
  }
  const jwtConfig = { secret: jwtSecret ?? DEV_JWT_SECRET };

  // 8. Create server with injected registry
  const server = await createServer(config, platform.cache, platform.logger, jwtConfig, registry);

  // 9. Listen
  const address = await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info('Gateway listening', { address });

  // 10. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.warn('Received shutdown signal', { signal });
    await platform.shutdown();
    await server.close();
    logger.info('Gateway shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
