/**
 * MCP authentication — Bearer token verification against the shared gateway
 * JWT secret. Authorization (which tools an identity may use) lives in authz.ts,
 * routed through the platform PDP.
 */

import { AuthService, type JwtConfig } from '@kb-labs/gateway-auth';
import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';

/**
 * Insecure development fallback. Must never be used in production — loadJwtConfig
 * throws when NODE_ENV=production and no real secret is configured.
 */
const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';

/**
 * Load the JWT config from the environment. Uses the same GATEWAY_JWT_SECRET as
 * the gateway so tokens issued by the gateway are accepted by the MCP daemon.
 */
export function loadJwtConfig(): JwtConfig {
  const secret = process.env.GATEWAY_JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'GATEWAY_JWT_SECRET must be set in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    );
  }
  return { secret: secret ?? DEV_JWT_SECRET };
}

/** Extract a Bearer token from an Authorization header, or null. */
export function extractBearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Resolve a verified AuthContext from an Authorization header.
 * Returns null for anonymous (no/invalid token) — the caller treats this as
 * "no tools, no execution".
 */
export async function resolveAuthContext(
  header: string | undefined,
  cache: ICache,
  jwtConfig: JwtConfig,
): Promise<AuthContext | null> {
  const token = extractBearer(header);
  if (!token) {
    return null;
  }
  return new AuthService(cache, jwtConfig).verify(token);
}
