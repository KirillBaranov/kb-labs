/**
 * Tests for the invites store (ADR-0020, Phase 1.4).
 *
 * Invites are admin-issued, one-shot, time-bounded credentials that let
 * a fresh user prove "yes, I'm the email the admin sent the link to" by
 * possessing the activation token.
 *
 * Invariants:
 * - Token is opaque, ≥32 bytes, base64url. Generated server-side.
 * - **Only the SHA-256 hash of the token is stored** — leaking the
 *   database does not leak working invite links.
 * - `findByToken(plain)` hashes input and looks up by hash.
 * - **Explicit `expiresAt > now` check (CD-9)** — TTL sweep is
 *   best-effort, the read path must not return expired rows.
 * - One *active* invite per `(email, tenantId)`. Used/revoked/expired
 *   invites don't block a fresh one. Email canonicalised (CD-4).
 * - `consume` marks status `used`; subsequent `findByToken` → null.
 * - `revoke` marks status `revoked`; subsequent `findByToken` → null.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import type { BaseDocument, IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { InvitesStore } from '../invites-store.js';

const t1 = 'tenant-a';
const t2 = 'tenant-b';
const HOUR = 60 * 60 * 1000;

let docs: IDocumentDatabase;
let invites: InvitesStore;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  invites = new InvitesStore(docs);
});

describe('createInvite', () => {
  it('returns an opaque base64url token of at least 32 bytes', async () => {
    const { activationToken } = await invites.createInvite({
      email: 'alice@example.com',
      tenantId: t1,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });
    // base64url alphabet only.
    expect(activationToken).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → at least 43 chars base64url-encoded.
    expect(activationToken.length).toBeGreaterThanOrEqual(43);
  });

  it('canonicalises email on input (CD-4)', async () => {
    const { inviteId } = await invites.createInvite({
      email: '  ALICE@EXAMPLE.COM  ',
      tenantId: t1,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });
    // The store should expose enough to verify normalisation on read.
    const found = await invites.findById(inviteId);
    expect(found?.email).toBe('alice@example.com');
  });

  it('does NOT store the plaintext token (only SHA-256 hash)', async () => {
    const { activationToken, inviteId } = await invites.createInvite({
      email: 'alice@example.com',
      tenantId: t1,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });
    // Direct collection peek — token plaintext must not appear anywhere.
    interface RawInviteRow extends BaseDocument {
      inviteId: string;
      tokenHash: string;
    }
    const rows = await docs.find<RawInviteRow>(
      'invites',
      { inviteId: { $eq: inviteId } },
    );
    expect(rows).toHaveLength(1);
    const raw = JSON.stringify(rows[0]);
    expect(raw).not.toContain(activationToken);
    // tokenHash is present and is 64 hex chars (SHA-256).
    expect(rows[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a second active invite for the same (email, tenantId)', async () => {
    await invites.createInvite({
      email: 'alice@example.com',
      tenantId: t1,
      groupId: 'tenant-member',
      createdBy: 'admin-1',
      ttlMs: HOUR,
    });
    await expect(
      invites.createInvite({
        email: 'ALICE@example.com',
        tenantId: t1,
        groupId: 'tenant-member',
        createdBy: 'admin-1',
        ttlMs: HOUR,
      }),
    ).rejects.toThrow();
  });

  it('allows a new invite for the same email in a different tenant', async () => {
    await invites.createInvite({
      email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await expect(
      invites.createInvite({
        email: 'alice@example.com', tenantId: t2, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
      }),
    ).resolves.not.toThrow();
  });

  it('allows a new invite after the previous one was consumed', async () => {
    const first = await invites.createInvite({
      email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await invites.consume(first.inviteId);
    await expect(
      invites.createInvite({
        email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
      }),
    ).resolves.not.toThrow();
  });

  it('allows a new invite after the previous one was revoked', async () => {
    const first = await invites.createInvite({
      email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await invites.revoke(first.inviteId);
    await expect(
      invites.createInvite({
        email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
      }),
    ).resolves.not.toThrow();
  });
});

describe('findByToken', () => {
  it('hashes input and finds the invite', async () => {
    const { activationToken, inviteId } = await invites.createInvite({
      email: 'alice@example.com', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    const found = await invites.findByToken(activationToken);
    expect(found?.inviteId).toBe(inviteId);
    expect(found?.email).toBe('alice@example.com');
    expect(found?.tenantId).toBe(t1);
    expect(found?.groupId).toBe('tenant-member');
    expect(found?.status).toBe('active');
  });

  it('returns null for an unknown token', async () => {
    const fake = 'A'.repeat(43);
    expect(await invites.findByToken(fake)).toBeNull();
  });

  it('returns null after consume (one-shot)', async () => {
    const { activationToken, inviteId } = await invites.createInvite({
      email: 'a@b.c', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await invites.consume(inviteId);
    expect(await invites.findByToken(activationToken)).toBeNull();
  });

  it('returns null after revoke', async () => {
    const { activationToken, inviteId } = await invites.createInvite({
      email: 'a@b.c', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await invites.revoke(inviteId);
    expect(await invites.findByToken(activationToken)).toBeNull();
  });

  it('returns null for an expired invite even if TTL sweep has not run (CD-9)', async () => {
    const { activationToken } = await invites.createInvite({
      email: 'a@b.c', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: 1,
    });
    await new Promise<void>(r => { setTimeout(r, 10); });
    expect(await invites.findByToken(activationToken)).toBeNull();
  });
});

describe('consume / revoke idempotency', () => {
  it('consume on unknown id is a no-op', async () => {
    await expect(invites.consume('nope')).resolves.not.toThrow();
  });

  it('revoke on unknown id is a no-op', async () => {
    await expect(invites.revoke('nope')).resolves.not.toThrow();
  });

  it('consuming an already-used invite is a no-op', async () => {
    const { inviteId } = await invites.createInvite({
      email: 'a@b.c', tenantId: t1, groupId: 'tenant-member', createdBy: 'a', ttlMs: HOUR,
    });
    await invites.consume(inviteId);
    await expect(invites.consume(inviteId)).resolves.not.toThrow();
  });
});
