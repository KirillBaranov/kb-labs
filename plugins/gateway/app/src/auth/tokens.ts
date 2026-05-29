import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import { AuthService, type JwtConfig } from '@kb-labs/gateway-auth';

/**
 * Resolve a Bearer token to an AuthContext.
 *
 * Priority:
 *   1. JWT verification (machine tokens issued via /auth/token).
 *   2. Host-registry opaque token (issued by /hosts/register, stored in cache
 *      as host:token:{uuid}). These are runtime-issued tokens for WebSocket agents,
 *      distinct from the removed static pre-seeded config tokens.
 */
export async function resolveToken(
  token: string,
  cache: ICache,
  jwtConfig: JwtConfig,
): Promise<AuthContext | null> {
  const authService = new AuthService(cache, jwtConfig);

  // Try JWT first (tokens issued via /auth/token).
  const jwtContext = await authService.verify(token);
  if (jwtContext) {return jwtContext;}

  // Fallback: host-registry opaque token (issued by /hosts/register).
  // Permissions default to ['host:connect'] for backward compatibility.
  const hostEntry = await cache.get<{ hostId: string; namespaceId: string; permissions?: string[] }>(
    `host:token:${token}`,
  );
  if (hostEntry) {
    return {
      type: 'machine',
      userId: hostEntry.hostId,
      namespaceId: hostEntry.namespaceId,
      tier: 'free',
      permissions: hostEntry.permissions ?? ['host:connect'],
    };
  }

  return null;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {return null;}
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}
