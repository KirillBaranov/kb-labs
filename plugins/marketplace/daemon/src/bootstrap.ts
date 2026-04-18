/**
 * @module @kb-labs/marketplace-app/bootstrap
 * Server bootstrap: initPlatform → MarketplaceService → Fastify server.
 */

import { platform, createServiceBootstrap, loadEnvFromRoot, getPlatformRoot } from '@kb-labs/core-runtime';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import { findRepoRoot } from '@kb-labs/core-sys';
import { createServer } from '@kb-labs/marketplace-api';
import { MarketplaceService } from '@kb-labs/marketplace-core';
import { NpmPackageSource } from '@kb-labs/marketplace-npm';

const DEFAULT_PORT = 5070;
const DEFAULT_HOST = '0.0.0.0';

export async function bootstrap(cwd: string): Promise<void> {
  const repoRoot = await findRepoRoot(cwd);
  loadEnvFromRoot(repoRoot);

  const port = parseInt(process.env.KB_MARKETPLACE_PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.KB_MARKETPLACE_HOST ?? DEFAULT_HOST;

  // Init platform (logger, cache, adapters)
  await createServiceBootstrap({ appId: 'marketplace', repoRoot });

  const log = createCorrelatedLogger(platform.logger, {
    serviceId: 'marketplace',
    logsSource: 'marketplace',
    layer: 'marketplace',
    service: 'marketplace-app',
    operation: 'marketplace.bootstrap',
  });
  log.info('Bootstrapping marketplace service', { repoRoot, port, host });

  // Create marketplace service. The daemon lives inside the platform root —
  // that's always the platform scope. `projectRoot` is passed per-request by
  // API clients (CLI, other services) so one daemon can serve many projects.
  // Use getPlatformRoot() — in installed mode this is the platform installation
  // dir (e.g. /kb-platform), not the project CWD where the daemon was started.
  const platformRoot = getPlatformRoot() ?? repoRoot;
  const service = new MarketplaceService({
    platformRoot,
    source: new NpmPackageSource(),
  });

  // Create and start Fastify server
  const server = await createServer({ service, port, logger: platform.logger });

  await server.listen({ port, host });
  log.info(`Marketplace service listening on http://${host}:${port}`);
  log.info(`OpenAPI docs: http://localhost:${port}/docs`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
