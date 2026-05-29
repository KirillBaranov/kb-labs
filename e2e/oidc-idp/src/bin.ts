/**
 * @module @kb-labs/e2e-oidc-idp/bin
 *
 * Standalone entry for running the E2E OIDC IdP as a container/process.
 *
 * Configuration is read from the environment so the same image can be wired
 * into the docker-compose auth-ci stack without code changes:
 *
 *   IDP_ISSUER                 (required) issuer id + discovery base, e.g.
 *                              https://idp-stub:9443
 *   IDP_CLIENT_ID              (required) registered OAuth client id
 *   IDP_CLIENT_SECRET          (required) registered OAuth client secret
 *   IDP_PORT                   listen port (default 9443 when TLS, else 9080)
 *   IDP_HOST                   bind host (default 0.0.0.0)
 *   IDP_AUTHORIZATION_ENDPOINT browser-facing authorize URL (optional; defaults
 *                              to ${IDP_ISSUER}/authorize). Set when the browser
 *                              reaches the IdP under a different hostname than
 *                              the gateway does.
 *   IDP_ALLOWED_REDIRECT_PREFIXES  comma-separated redirect_uri allow-list
 *   IDP_ID_TOKEN_TTL_SEC       ID-token lifetime (default 300)
 *   IDP_TLS_KEY / IDP_TLS_CERT paths to PEM key/cert; when both set, serve https
 */

import { readFileSync } from 'node:fs';
import { createIdpServer, type IdpServerOptions } from './idp-server.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

async function main(): Promise<void> {
  const issuer = requireEnv('IDP_ISSUER');
  const clientId = requireEnv('IDP_CLIENT_ID');
  const clientSecret = requireEnv('IDP_CLIENT_SECRET');

  const tlsKeyPath = process.env.IDP_TLS_KEY;
  const tlsCertPath = process.env.IDP_TLS_CERT;
  const tls =
    tlsKeyPath && tlsCertPath
      ? { key: readFileSync(tlsKeyPath), cert: readFileSync(tlsCertPath) }
      : undefined;

  const prefixes = process.env.IDP_ALLOWED_REDIRECT_PREFIXES
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const options: IdpServerOptions = {
    issuer,
    clientId,
    clientSecret,
    authorizationEndpoint: process.env.IDP_AUTHORIZATION_ENDPOINT,
    allowedRedirectPrefixes: prefixes && prefixes.length > 0 ? prefixes : undefined,
    idTokenTtlSec: process.env.IDP_ID_TOKEN_TTL_SEC
      ? Number(process.env.IDP_ID_TOKEN_TTL_SEC)
      : undefined,
    tls,
  };

  const handle = await createIdpServer(options);

  const port = process.env.IDP_PORT ? Number(process.env.IDP_PORT) : tls ? 9443 : 9080;
  const host = process.env.IDP_HOST ?? '0.0.0.0';
  await handle.listen(port, host);

  console.log(
    `[e2e-oidc-idp] listening on ${tls ? 'https' : 'http'}://${host}:${port} (issuer=${issuer})`,
  );

  const shutdown = (): void => {
    void handle.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  console.error('[e2e-oidc-idp] failed to start:', err);
  process.exit(1);
});
