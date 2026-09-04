#!/usr/bin/env node
import { makeAssemblyHook } from "@kb-labs/plugin-runtime";
import { runService } from "@kb-labs/shared-daemon";
import { getListenOptions } from "@kb-labs/shared-http";
import type { JwtConfig } from "@kb-labs/gateway-auth";
import { RegistryService } from "@kb-labs/marketplace-registry-core";
import { createRegistryServer } from "@kb-labs/marketplace-registry-api";

const DEV_JWT_SECRET = "dev-insecure-secret-change-me";

async function main(): Promise<void> {
  await runService({
    appId: "marketplace-registry",
    defaultPort: 5071,
    portEnvVar: "KB_REGISTRY_PORT",
    defaultHost: "0.0.0.0",
    hostEnvVar: "KB_REGISTRY_HOST",
    platform: {
      assemblyHook: makeAssemblyHook(),
    },
    async setup({ platform, logger, port, host, platformRoot }) {
      void platformRoot; // reserved for future per-project scoping

      const service = new RegistryService({
        storage: platform.storage,
        cache: platform.cache,
        logger: platform.logger,
        baseUrl: process.env.KB_REGISTRY_URL ?? `http://localhost:${port}`,
        signingPrivateKey: process.env.KB_REGISTRY_SIGNING_KEY,
        siteUrl: process.env.KB_SITE_URL ?? "https://kblabs.ru",
      });

      const jwtSecret = process.env.GATEWAY_JWT_SECRET;
      const isProduction = process.env.NODE_ENV === "production";
      if (!jwtSecret && isProduction) {
        throw new Error("GATEWAY_JWT_SECRET must be set in production");
      }
      if (!jwtSecret) {
        logger.warn(
          "GATEWAY_JWT_SECRET not set — using insecure default (dev only, never use in production!)",
        );
      }
      const jwtConfig: JwtConfig = { secret: jwtSecret ?? DEV_JWT_SECRET };

      const server = await createRegistryServer({
        port,
        host,
        logger: platform.logger,
        registry: service,
        jwtConfig,
      });
      await server.listen(getListenOptions(port, host));

      // Note: actual binding may be via Unix socket (KB_SOCKET_PATH) — see getListenOptions()

      return async () => {
        await server.close();
      };
    },
  });
}

main().catch((err) => {
  console.error("marketplace-registry failed to start", err);
  process.exit(1);
});
