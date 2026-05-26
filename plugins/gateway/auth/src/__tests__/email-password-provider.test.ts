/**
 * Tests for the built-in email-password identity provider (ADR-0020,
 * Phase 1.10).
 *
 * Critical behaviours:
 *
 * - Implements `IIdentityProvider` (`id`, `kind`, `authenticate`).
 * - Email canonicalised on input (CD-4).
 * - **Constant-time response to all failure modes (CD-8):** every
 *   not-ok path runs a real bcrypt compare against a dummy hash so
 *   "unknown user", "disabled user", and "wrong password" take roughly
 *   the same time. We verify both the contract (single coarse error
 *   union) and that bcrypt was invoked even on the missing-user path.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { createInMemoryDocumentDatabase } from '@kb-labs/core-platform/adapters/testing';
import { UsersStore } from '../users-store.js';
import { CredentialsStore } from '../credentials-store.js';
import { createEmailPasswordProvider } from '../providers/email-password.js';

let users: UsersStore;
let credentials: CredentialsStore;

beforeEach(() => {
  const docs = createInMemoryDocumentDatabase();
  users = new UsersStore(docs);
  credentials = new CredentialsStore(docs);
});

const provider = (tenantId: string) =>
  createEmailPasswordProvider({ users, credentials, tenantId, bcryptCost: 4 });

describe('contract shape', () => {
  it('has id="email-password" and kind="password"', () => {
    const p = provider('t1');
    expect(p.id).toBe('email-password');
    expect(p.kind).toBe('password');
  });
});

describe('happy path', () => {
  it('authenticates an active user with correct password', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'alice@x.com', status: 'active' });
    const hash = await bcrypt.hash('correct-pw', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t1').authenticate({ email: 'alice@x.com', password: 'correct-pw' });
    expect(r).toEqual({ ok: true, email: 'alice@x.com', externalId: 'u1' });
  });

  it('canonicalises email input (CD-4)', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'alice@x.com', status: 'active' });
    const hash = await bcrypt.hash('pw', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t1').authenticate({ email: '  ALICE@X.COM  ', password: 'pw' });
    expect(r.ok).toBe(true);
  });
});

describe('failure paths return identical shape (CD-8)', () => {
  it('returns { ok: false, reason: "unknown" } when user does not exist', async () => {
    const r = await provider('t1').authenticate({ email: 'nobody@x.com', password: 'whatever' });
    expect(r).toEqual({ ok: false, reason: 'unknown' });
  });

  it('returns { ok: false, reason: "disabled" } for disabled user', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'disabled' });
    const hash = await bcrypt.hash('pw', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t1').authenticate({ email: 'a@x.com', password: 'pw' });
    expect(r).toEqual({ ok: false, reason: 'disabled' });
  });

  it('returns { ok: false, reason: "disabled" } for pending user', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'pending' });
    const hash = await bcrypt.hash('pw', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t1').authenticate({ email: 'a@x.com', password: 'pw' });
    expect(r).toEqual({ ok: false, reason: 'disabled' });
  });

  it('returns { ok: false, reason: "unknown" } when active user has no email-password credential', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'active' });
    const r = await provider('t1').authenticate({ email: 'a@x.com', password: 'whatever' });
    expect(r).toEqual({ ok: false, reason: 'unknown' });
  });

  it('returns { ok: false, reason: "invalid" } for wrong password', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'active' });
    const hash = await bcrypt.hash('correct', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t1').authenticate({ email: 'a@x.com', password: 'wrong' });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('constant-time: bcrypt is invoked on every not-ok path (CD-8)', () => {
  it('calls bcrypt.compare even when user is missing', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    await provider('t1').authenticate({ email: 'nobody@x.com', password: 'whatever' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls bcrypt.compare even when credential is missing', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'active' });
    const spy = vi.spyOn(bcrypt, 'compare');
    await provider('t1').authenticate({ email: 'a@x.com', password: 'whatever' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('input validation', () => {
  it('rejects bad input shape with reason: invalid', async () => {
    const r1 = await provider('t1').authenticate({ password: 'no-email' } as unknown);
    expect(r1).toEqual({ ok: false, reason: 'invalid' });
    const r2 = await provider('t1').authenticate(null);
    expect(r2).toEqual({ ok: false, reason: 'invalid' });
    const r3 = await provider('t1').authenticate({ email: '', password: '' });
    expect(r3).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('tenant isolation', () => {
  it('does not match a user from a different tenant', async () => {
    await users.create({ userId: 'u1', tenantId: 't1', email: 'a@x.com', status: 'active' });
    const hash = await bcrypt.hash('pw', 4);
    await credentials.setCredential({ userId: 'u1', providerId: 'email-password', hash });

    const r = await provider('t2').authenticate({ email: 'a@x.com', password: 'pw' });
    expect(r).toEqual({ ok: false, reason: 'unknown' });
  });
});
