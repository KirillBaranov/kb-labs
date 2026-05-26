/**
 * Tests for the credentials store (ADR-0020, Phase 1.2, CD-6).
 *
 * Credentials live in their own collection — *not* on `User` — so that
 * adding Google/Okta/etc. later means another row, not a migration.
 *
 * Invariants:
 * - One credential per (userId, providerId) — unique compound.
 * - `setCredential` is upsert: same key replaces the hash.
 * - `deleteAllForUser` cascades when a `User` is removed.
 * - The store stores opaque hashes; bcrypt cost/algorithm choices live
 *   in the email-password provider, not here.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { CredentialsStore } from '../credentials-store.js';

let docs: IDocumentDatabase;
let creds: CredentialsStore;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
  creds = new CredentialsStore(docs);
});

describe('setCredential + getCredential', () => {
  it('round-trips a credential', async () => {
    await creds.setCredential({
      userId: 'u1',
      providerId: 'email-password',
      hash: '$2b$12$abc',
    });
    const got = await creds.getCredential('u1', 'email-password');
    expect(got).toMatchObject({
      userId: 'u1',
      providerId: 'email-password',
      hash: '$2b$12$abc',
    });
  });

  it('returns null for missing credential', async () => {
    expect(await creds.getCredential('u1', 'email-password')).toBeNull();
  });

  it('upserts on the same (userId, providerId)', async () => {
    await creds.setCredential({ userId: 'u1', providerId: 'email-password', hash: 'h1' });
    await creds.setCredential({ userId: 'u1', providerId: 'email-password', hash: 'h2' });
    const got = await creds.getCredential('u1', 'email-password');
    expect(got?.hash).toBe('h2');
  });

  it('allows the same userId across different providerIds', async () => {
    await creds.setCredential({ userId: 'u1', providerId: 'email-password', hash: 'h1' });
    await creds.setCredential({ userId: 'u1', providerId: 'google', hash: 'g1' });
    expect((await creds.getCredential('u1', 'email-password'))?.hash).toBe('h1');
    expect((await creds.getCredential('u1', 'google'))?.hash).toBe('g1');
  });
});

describe('deleteCredential', () => {
  it('removes one credential without touching others', async () => {
    await creds.setCredential({ userId: 'u1', providerId: 'email-password', hash: 'h1' });
    await creds.setCredential({ userId: 'u1', providerId: 'google', hash: 'g1' });
    await creds.deleteCredential('u1', 'email-password');
    expect(await creds.getCredential('u1', 'email-password')).toBeNull();
    expect((await creds.getCredential('u1', 'google'))?.hash).toBe('g1');
  });

  it('is idempotent', async () => {
    await expect(creds.deleteCredential('u1', 'email-password')).resolves.not.toThrow();
  });
});

describe('deleteAllForUser (cascade hook)', () => {
  it('removes every credential for that userId', async () => {
    await creds.setCredential({ userId: 'u1', providerId: 'email-password', hash: 'h1' });
    await creds.setCredential({ userId: 'u1', providerId: 'google', hash: 'g1' });
    await creds.setCredential({ userId: 'u2', providerId: 'email-password', hash: 'other' });
    await creds.deleteAllForUser('u1');
    expect(await creds.getCredential('u1', 'email-password')).toBeNull();
    expect(await creds.getCredential('u1', 'google')).toBeNull();
    // u2 untouched
    expect((await creds.getCredential('u2', 'email-password'))?.hash).toBe('other');
  });
});
