/**
 * Tests for the sessions store (ADR-0020, Phase 1.5).
 *
 * This is the most security-critical store in the auth core. It owns:
 *
 * - Session families (one per device) — the unit of revocation.
 * - Refresh tokens with one-shot rotation and reuse detection.
 * - The 5-second grace window (CD-5) that survives multi-tab races
 *   and flaky-network retries without killing legitimate sessions.
 *
 * Coverage exhaustive on purpose: the rotation logic is the only thing
 * standing between a stolen refresh cookie and a sustained session
 * compromise.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import {
  SessionsStore,
  RefreshReuseDetectedError,
  RefreshNotFoundError,
  RefreshExpiredError,
} from '../sessions-store.js';

const HOUR = 60 * 60 * 1000;

let docs: IDocumentDatabase;
let sessions: SessionsStore;
let nowMs: number;

const now = () => nowMs;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  nowMs = 1_000_000_000_000;
  sessions = new SessionsStore(docs, { now, refreshTtlMs: HOUR, graceWindowMs: 5_000 });
});

describe('createSession', () => {
  it('creates a session family with the first refresh token', async () => {
    const result = await sessions.createSession({
      userId: 'u1',
      tenantId: 't1',
      deviceCtx: { userAgent: 'Chrome', ip: '1.2.3.4' },
    });
    expect(result.familyId).toBeTypeOf('string');
    expect(result.refreshJti).toBeTypeOf('string');
    expect(result.refreshExpiresAt).toBe(nowMs + HOUR);

    const families = await sessions.listFamiliesByUser('u1');
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({
      familyId: result.familyId,
      userId: 'u1',
      tenantId: 't1',
      userAgent: 'Chrome',
      ipFirst: '1.2.3.4',
    });
  });

  it('different devices yield independent families', async () => {
    const a = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'Chrome' } });
    const b = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'Firefox' } });
    expect(a.familyId).not.toBe(b.familyId);
    expect(a.refreshJti).not.toBe(b.refreshJti);
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(2);
  });
});

describe('rotateRefresh — happy path', () => {
  it('rotates a fresh refresh token, marks the old as consumed, family lives on', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    nowMs += 1_000;
    const rotated = await sessions.rotateRefresh(initial.refreshJti);

    expect(rotated.newJti).toBeTypeOf('string');
    expect(rotated.newJti).not.toBe(initial.refreshJti);
    expect(rotated.familyId).toBe(initial.familyId);
    expect(rotated.newRefreshExpiresAt).toBe(nowMs + HOUR);

    // Family still alive.
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(1);
  });
});

describe('rotateRefresh — error cases', () => {
  it('throws RefreshNotFoundError for unknown jti', async () => {
    await expect(sessions.rotateRefresh('does-not-exist')).rejects.toBeInstanceOf(RefreshNotFoundError);
  });

  it('throws RefreshExpiredError when refresh is past expiry, and does NOT kill the family', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    nowMs += HOUR + 1;
    await expect(sessions.rotateRefresh(initial.refreshJti)).rejects.toBeInstanceOf(RefreshExpiredError);
    // Family stays — natural expiry isn't a security event.
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(1);
  });
});

describe('rotateRefresh — reuse detection (CD-5)', () => {
  it('reusing a consumed jti OUTSIDE the grace window kills the entire family', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    await sessions.rotateRefresh(initial.refreshJti); // legitimately rotated

    // 6 seconds later (past the 5s grace) someone tries the old jti again — attacker.
    nowMs += 6_000;
    await expect(sessions.rotateRefresh(initial.refreshJti)).rejects.toBeInstanceOf(RefreshReuseDetectedError);

    // Family killed — no live refresh tokens, no family.
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(0);
  });

  it('reusing a consumed jti INSIDE the grace window returns the same replacement and keeps family alive', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    const first = await sessions.rotateRefresh(initial.refreshJti);

    // 2 seconds later (still within 5s grace) the client retries with the
    // SAME old jti — flaky network or multi-tab race.
    nowMs += 2_000;
    const second = await sessions.rotateRefresh(initial.refreshJti);

    expect(second.newJti).toBe(first.newJti);
    expect(second.familyId).toBe(first.familyId);
    // Family still alive.
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(1);
  });

  it('grace window does NOT extend across multiple rotations', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    const first = await sessions.rotateRefresh(initial.refreshJti);
    // Legitimately rotate again — now `first.newJti` is consumed.
    nowMs += 1_000;
    await sessions.rotateRefresh(first.newJti);
    // Now reuse the *original* initial.refreshJti within 5s of its consume —
    // grace window relates to ITS own consumption, so this still returns
    // first.newJti (the replacedBy chained at the time of consume).
    const second = await sessions.rotateRefresh(initial.refreshJti);
    expect(second.newJti).toBe(first.newJti);
  });
});

describe('revokeFamily', () => {
  it('removes the family and its refresh tokens; the refresh becomes a not-found, not a reuse', async () => {
    const initial = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: {} });
    await sessions.revokeFamily(initial.familyId);
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(0);
    await expect(sessions.rotateRefresh(initial.refreshJti)).rejects.toBeInstanceOf(RefreshNotFoundError);
  });

  it('is idempotent', async () => {
    await expect(sessions.revokeFamily('nope')).resolves.not.toThrow();
  });
});

describe('revokeAllUserSessions / revokeAllUserSessionsExcept', () => {
  it('revokeAllUserSessions kills every family for the user', async () => {
    await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'a' } });
    await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'b' } });
    await sessions.createSession({ userId: 'u2', tenantId: 't1', deviceCtx: { userAgent: 'a' } });
    await sessions.revokeAllUserSessions('u1');
    expect(await sessions.listFamiliesByUser('u1')).toHaveLength(0);
    expect(await sessions.listFamiliesByUser('u2')).toHaveLength(1);
  });

  it('revokeAllUserSessionsExcept keeps the named family alive', async () => {
    const a = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'a' } });
    const b = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'b' } });
    await sessions.revokeAllUserSessionsExcept('u1', a.familyId);
    const remaining = await sessions.listFamiliesByUser('u1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.familyId).toBe(a.familyId);
    // The other family's refresh is gone (not-found, not reuse).
    await expect(sessions.rotateRefresh(b.refreshJti)).rejects.toBeInstanceOf(RefreshNotFoundError);
  });
});

describe('listFamiliesByUser', () => {
  it('returns family metadata, sorted by lastUsedAt desc', async () => {
    const first = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'first' } });
    nowMs += 1_000;
    const second = await sessions.createSession({ userId: 'u1', tenantId: 't1', deviceCtx: { userAgent: 'second' } });
    const got = await sessions.listFamiliesByUser('u1');
    expect(got.map(f => f.familyId)).toEqual([second.familyId, first.familyId]);
  });

  it('returns [] for unknown user', async () => {
    expect(await sessions.listFamiliesByUser('nope')).toEqual([]);
  });
});
