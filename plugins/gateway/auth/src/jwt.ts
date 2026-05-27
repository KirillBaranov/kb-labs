/**
 * JWT sign / verify / refresh logic.
 * Pure functions — no side effects, no ICache dependency.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import type { JwtPayload, TokenType } from '@kb-labs/gateway-contracts';

const ACCESS_TOKEN_TTL = 15 * 60;       // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 days in seconds

export interface JwtConfig {
  /** Raw secret string — converted to TextEncoder internally */
  secret: string;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface SignAccessTokenOptions {
  hostId: string;
  namespaceId: string;
  tier: 'free' | 'pro' | 'enterprise';
  type: TokenType;
}

export async function signAccessToken(
  opts: SignAccessTokenOptions,
  config: JwtConfig,
): Promise<{ token: string; expiresIn: number }> {
  const key = getSecretKey(config.secret);
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    namespaceId: opts.namespaceId,
    tier: opts.tier,
    type: opts.type,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.hostId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL)
    .sign(key);

  return { token, expiresIn: ACCESS_TOKEN_TTL };
}

export async function signRefreshToken(
  hostId: string,
  config: JwtConfig,
): Promise<string> {
  const key = getSecretKey(config.secret);
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();

  return new SignJWT({ type: 'refresh', jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(hostId)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TOKEN_TTL)
    .sign(key);
}

export async function verifyAccessToken(
  token: string,
  config: JwtConfig,
): Promise<JwtPayload | null> {
  try {
    const key = getSecretKey(config.secret);
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
  config: JwtConfig,
): Promise<{ hostId: string } | null> {
  try {
    const key = getSecretKey(config.secret);
    const { payload } = await jwtVerify(token, key);
    if ((payload as JWTPayload & { type?: string }).type !== 'refresh') {
      return null;
    }
    if (!payload.sub) {return null;}
    return { hostId: payload.sub };
  } catch {
    return null;
  }
}

// ─── User-flavoured tokens (ADR-0020, Phase 1.13) ────────────────────────
//
// These live alongside the machine-token helpers above. The shape is
// deliberately different: `type: 'user'` for access, `type: 'refresh'`
// + tenantId + familyId for refresh. `fam` (familyId) is **mandatory**
// in BOTH access and refresh — verifyUserAccessToken rejects tokens
// without it even on otherwise valid signatures. Without `fam` in the
// access cookie, /auth/password/change cannot identify the current
// session family to spare on revoke-all-others (CD-2).
//
// Payload never contains role / scopes / permissions (principle #3).
// Authorization is resolved per-request by the PDP.

export interface SignUserTokenOptions {
  userId: string;
  tenantId: string;
  familyId: string;
  /** TTL in seconds. */
  ttlSec: number;
}

export interface UserAccessPayload {
  userId: string;
  tenantId: string;
  familyId: string;
  jti: string;
  /** Token type discriminator. Access tokens carry 'user'. */
  type: 'user';
  iat: number;
  exp: number;
}

export interface UserRefreshPayload {
  userId: string;
  tenantId: string;
  familyId: string;
  jti: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

export interface UserAccessSignResult {
  token: string;
  expiresInSec: number;
  jti: string;
}

export async function signUserAccessToken(
  opts: SignUserTokenOptions,
  config: JwtConfig,
): Promise<UserAccessSignResult> {
  const key = getSecretKey(config.secret);
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const token = await new SignJWT({
    tenantId: opts.tenantId,
    fam: opts.familyId,
    type: 'user',
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + opts.ttlSec)
    .sign(key);
  return { token, expiresInSec: opts.ttlSec, jti };
}

/**
 * Sign a user refresh token.
 *
 * When the caller already owns the `jti` (typical: the sessions-store
 * minted it inside `createSession`/`rotateRefresh`), pass it via the
 * second argument so the JWT and the store agree on the identifier.
 * Otherwise the helper generates one — used by tests that don't go
 * through sessions-store.
 */
export async function signUserRefreshToken(
  opts: SignUserTokenOptions & { jti?: string },
  config: JwtConfig,
): Promise<string> {
  const key = getSecretKey(config.secret);
  const now = Math.floor(Date.now() / 1000);
  const jti = opts.jti ?? randomUUID();
  return new SignJWT({
    tenantId: opts.tenantId,
    fam: opts.familyId,
    type: 'refresh',
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opts.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + opts.ttlSec)
    .sign(key);
}

interface RawUserClaims extends JWTPayload {
  tenantId?: string;
  fam?: string;
  type?: string;
  jti?: string;
}

const normaliseAccess = (raw: RawUserClaims): UserAccessPayload | null => {
  if (raw.type !== 'user') {return null;}
  if (!raw.sub || !raw.tenantId || !raw.fam || !raw.jti) {return null;}
  if (typeof raw.iat !== 'number' || typeof raw.exp !== 'number') {return null;}
  return {
    userId: raw.sub,
    tenantId: raw.tenantId,
    familyId: raw.fam,
    jti: raw.jti,
    type: 'user',
    iat: raw.iat,
    exp: raw.exp,
  };
};

const normaliseRefresh = (raw: RawUserClaims): UserRefreshPayload | null => {
  if (raw.type !== 'refresh') {return null;}
  if (!raw.sub || !raw.tenantId || !raw.fam || !raw.jti) {return null;}
  if (typeof raw.iat !== 'number' || typeof raw.exp !== 'number') {return null;}
  return {
    userId: raw.sub,
    tenantId: raw.tenantId,
    familyId: raw.fam,
    jti: raw.jti,
    type: 'refresh',
    iat: raw.iat,
    exp: raw.exp,
  };
};

export async function verifyUserAccessToken(
  token: string,
  config: JwtConfig,
): Promise<UserAccessPayload | null> {
  try {
    const key = getSecretKey(config.secret);
    const { payload } = await jwtVerify(token, key);
    return normaliseAccess(payload as RawUserClaims);
  } catch {
    return null;
  }
}

export async function verifyUserRefreshToken(
  token: string,
  config: JwtConfig,
): Promise<UserRefreshPayload | null> {
  try {
    const key = getSecretKey(config.secret);
    const { payload } = await jwtVerify(token, key);
    return normaliseRefresh(payload as RawUserClaims);
  } catch {
    return null;
  }
}
