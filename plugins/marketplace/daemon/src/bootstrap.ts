/**
 * @module @kb-labs/marketplace-app/bootstrap
 * Server bootstrap: runDaemon → platformBootstrap → MarketplaceService → Fastify server.
 */

import { createServiceBootstrap, getPlatformRoot } from '@kb-labs/core-runtime';
import { makeAssemblyHook } from '@kb-labs/plugin-runtime';
import { getListenOptions } from '@kb-labs/shared-http';
import { runDaemon } from '@kb-labs/shared-daemon';
import { findRepoRoot } from '@kb-labs/core-sys';
import { readKbConfig } from '@kb-labs/core-config';
import { createServer } from '@kb-labs/marketplace-api';
import { MarketplaceService } from '@kb-labs/marketplace-core';
import { NpmPackageSource, RegistryPackageSource } from '@kb-labs/marketplace-npm';

export async function bootstrap(_cwd: string = process.cwd()): Promise<void> {
  await runDaemon(
    {
      appId: 'marketplace',
      defaultPort: 5070,
      portEnvVar: 'KB_MARKETPLACE_PORT',
      // Defaults to 0.0.0.0 for Docker/dev compat. Set KB_MARKETPLACE_HOST=127.0.0.1 to restrict to loopback.
      defaultHost: '0.0.0.0',
      hostEnvVar: 'KB_MARKETPLACE_HOST',
      async setup({ platform, logger, port, host }) {
        // Resolve repo root for config reading (findRepoRoot is fast/cached by FS).
        const repoRoot = await findRepoRoot(process.cwd());

        // Use getPlatformRoot() — in installed mode this is the platform installation
        // dir (e.g. /kb-platform), not the project CWD where the daemon was started.
        const platformRoot = getPlatformRoot() ?? repoRoot;

        // Read marketplace.registry config to wire up RegistryPackageSource for kb: specs.
        const kbConfig = await readKbConfig(repoRoot);
        const registryConfig = (kbConfig?.data as Record<string, unknown> | undefined)?.marketplace as Record<string, unknown> | undefined;
        const registryUrl = (registryConfig?.registry as Record<string, unknown> | undefined)?.url as string | undefined
          ?? process.env.KB_REGISTRY_URL;

        const registrySource = registryUrl
          ? new RegistryPackageSource({ registryUrl, authToken: process.env.KB_REGISTRY_TOKEN })
          : undefined;

        const service = new MarketplaceService({
          platformRoot,
          source: new NpmPackageSource(),
          registrySource,
        });

        const server = await createServer({ service, port, logger });
        await server.listen(getListenOptions(port, host));

        logger.info(`Marketplace service listening on http://${host}:${port}`);
        logger.info(`OpenAPI docs: http://localhost:${port}/docs`);

        return async () => {
          await server.close();
        };
      },
    },
    (appId, repoRoot) =>
      createServiceBootstrap({ appId, repoRoot, assemblyHook: makeAssemblyHook() }),
  );
}
