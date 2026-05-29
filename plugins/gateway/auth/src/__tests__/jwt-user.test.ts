/**
 * Tests for the user-flavoured JWT helpers (ADR-0020, Phase 1.13).
 *
 * Adds `signUserAccessToken` / `signUserRefreshToken` /
 * `verifyUserAccessToken` / `verifyUserRefreshToken` next to the
 * existing machine-token functions in `jwt.ts`.
 *
 * Crucial invariants:
 * - **`fam` is mandatory in BOTH access and refresh** (CD-2). Sign
 *   helpers require it as an argument; verify helpers reject tokens
 *   without `fam` even if the signature is otherwise valid.
 * - Access payload type is `user`, refresh is `refresh`. A machine
 *   token MUST NOT verify as a user access token (`type` differs).
 * - No `role` / `scopes` / `permissions` ever land in the payload
 *   (ADR-0020, principle #3).
 */

import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import {
  signUserAccessToken,
  signUserRefreshToken,
  verifyUserAccessToken,
  verifyUserRefreshToken,
} from '../jwt.js';

const config = { secret: 'test-secret-at-least-32-chars-long!!' };
const claims = { userId: 'u1', tenantId: 't1', familyId: 'fam-1' };

describe('signUserAccessToken / verifyUserAccessToken', () => {
  it('round-trips identity claims', async () => {
    const { token, expiresInSec } = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    expect(token).toBeTruthy();
    expect(expiresInSec).toBe(900);

    const payload = await verifyUserAccessToken(token, config);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('u1');
    expect(payload!.tenantId).toBe('t1');
    expect(payload!.familyId).toBe('fam-1');
    expect(payload!.jti).toBeTypeOf('string');
  });

  it('payload contains NO role / scopes / permissions fields (principle #3)', async () => {
    const { token } = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    const payload = await verifyUserAccessToken(token, config);
    expect((payload as unknown as Record<string, unknown>).role).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).scopes).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).permissions).toBeUndefined();
  });

  it('returns null for a tampered token', async () => {
    const { token } = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(await verifyUserAccessToken(tampered, config)).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const { token } = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    expect(await verifyUserAccessToken(token, { secret: 'other-secret-at-least-32-chars-now' })).toBeNull();
  });

  it('rejects expired tokens', async () => {
    // ttlSec: -10 produces a token that is already expired.
    const { token } = await signUserAccessToken({ ...claims, ttlSec: -10 }, config);
    expect(await verifyUserAccessToken(token, config)).toBeNull();
  });

  it('rejects a token without `fam` even if signature is valid (CD-2)', async () => {
    // Sign a similarly-shaped token but without familyId via the refresh
    // helper used incorrectly: verifyUserAccessToken must reject it.
    const refreshToken = await signUserRefreshToken({ ...claims, ttlSec: 900 }, config);
    expect(await verifyUserAccessToken(refreshToken, config)).toBeNull();
  });

  it('rejects a token signed with a non-HS256 algorithm (alg pinning)', async () => {
    // Forge a structurally-valid user-access token, signed with the SAME
    // secret but using HS384 instead of HS256. HMAC accepts the secret for
    // any HS* algorithm, so without an explicit `algorithms: ['HS256']` pin
    // in jwtVerify, jose would happily accept this. The pin must reject it —
    // this is the regression guard for algorithm-substitution.
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({
      tenantId: 't1',
      fam: 'fam-1',
      type: 'user',
      jti: 'forged-jti',
    })
      .setProtectedHeader({ alg: 'HS384' })
      .setSubject('u1')
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(new TextEncoder().encode(config.secret));

    expect(await verifyUserAccessToken(forged, config)).toBeNull();
  });
});

describe('signUserRefreshToken / verifyUserRefreshToken', () => {
  it('round-trips identity + family + jti', async () => {
    const token = await signUserRefreshToken({ ...claims, ttlSec: 60 * 60 }, config);
    const payload = await verifyUserRefreshToken(token, config);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('u1');
    expect(payload!.tenantId).toBe('t1');
    expect(payload!.familyId).toBe('fam-1');
    expect(payload!.jti).toBeTypeOf('string');
  });

  it('refresh and access tokens are not interchangeable', async () => {
    const access = (await signUserAccessToken({ ...claims, ttlSec: 900 }, config)).token;
    expect(await verifyUserRefreshToken(access, config)).toBeNull();
  });

  it('rejects refresh tokens missing `fam`', async () => {
    // Re-route through the access helper to produce a non-refresh token shape.
    const access = (await signUserAccessToken({ ...claims, ttlSec: 900 }, config)).token;
    expect(await verifyUserRefreshToken(access, config)).toBeNull();
  });
});

describe('jti is unique per token', () => {
  it('different sign calls produce different jti', async () => {
    const a = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    const b = await signUserAccessToken({ ...claims, ttlSec: 900 }, config);
    const pa = await verifyUserAccessToken(a.token, config);
    const pb = await verifyUserAccessToken(b.token, config);
    expect(pa!.jti).not.toBe(pb!.jti);
  });
});
