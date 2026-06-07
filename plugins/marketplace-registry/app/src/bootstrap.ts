import { platform, createServiceBootstrap, loadEnvFromRoot, getPlatformRoot } from '@kb-labs/core-runtime';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { findRepoRoot } from '@kb-labs/core-sys';
import { RegistryService } from '@kb-labs/marketplace-registry-core';
import { createRegistryServer } from '@kb-labs/marketplace-registry-api';

const DEFAULT_PORT = 5071;
const DEFAULT_HOST = process.env.KB_REGISTRY_HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const repoRoot = await findRepoRoot(process.cwd());
  loadEnvFromRoot(repoRoot);

  const port = parseInt(process.env.KB_REGISTRY_PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.KB_REGISTRY_HOST ?? DEFAULT_HOST;

  await createServiceBootstrap({ appId: 'marketplace-registry', repoRoot, assemblyHook: makeAssemblyHook() });

  const log = createCorrelatedLogger(platform.logger, {
    serviceId: 'marketplace-registry',
    logsSource: 'marketplace-registry',
    layer: 'marketplace-registry',
    service: 'marketplace-registry-app',
    operation: 'marketplace-registry.bootstrap',
  });
  log.info('Bootstrapping marketplace-registry service', { repoRoot, port, host });

  const platformRoot = getPlatformRoot() ?? repoRoot;
  void platformRoot; // used for future per-project scoping

  const service = new RegistryService({
    storage: platform.storage,
    cache: platform.cache,
    logger: platform.logger,
    baseUrl: process.env.KB_REGISTRY_URL ?? `http://localhost:${port}`,
    signingPrivateKey: process.env.KB_REGISTRY_SIGNING_KEY,
    siteUrl: process.env.KB_SITE_URL ?? 'https://kblabs.ru',
  });

  const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
  const jwtSecret = process.env.GATEWAY_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!jwtSecret && isProduction) {
    throw new Error('GATEWAY_JWT_SECRET must be set in production');
  }
  if (!jwtSecret) { log.warn('GATEWAY_JWT_SECRET not set — using insecure default (dev only, never use in production!)'); }
  const jwtConfig: JwtConfig = { secret: jwtSecret ?? DEV_JWT_SECRET };

  const server = await createRegistryServer({ port, host, logger: platform.logger, registry: service, jwtConfig });

  await server.listen({ port, host });
  log.info(`marketplace-registry listening on http://${host}:${port}`);
  log.info(`OpenAPI docs: http://localhost:${port}/docs`);

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('marketplace-registry failed to start', err);
  process.exit(1);
});
