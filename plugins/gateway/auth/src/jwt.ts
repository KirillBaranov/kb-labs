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
