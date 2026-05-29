import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import { AuthService, type JwtConfig } from '@kb-labs/gateway-auth';

/**
 * Resolve a Bearer token to an AuthContext.
 * Tries JWT verification first, falls back to static machine token (dev compat).
 */
export async function resolveToken(
  token: string,
  cache: ICache,
  jwtConfig: JwtConfig,
): Promise<AuthContext | null> {
  const authService = new AuthService(cache, jwtConfig);

  // Try JWT first (v2)
  const jwtContext = await authService.verify(token);
  if (jwtContext) {return jwtContext;}

  // Fallback: static machine token in ICache (v1 compat — dev-studio-token etc.)
  const machineEntry = await cache.get<{ hostId: string; namespaceId: string }>(
    `host:token:${token}`,
  );
  if (machineEntry) {
    return {
      type: 'machine',
      userId: machineEntry.hostId,
      namespaceId: machineEntry.namespaceId,
      tier: 'free',
      permissions: ['host:connect'],
    };
  }

  return null;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {return null;}
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}
