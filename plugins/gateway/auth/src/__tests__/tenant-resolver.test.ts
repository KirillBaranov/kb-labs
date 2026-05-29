/**
 * Tests for the tenant resolver (ADR-0020, Phase 1.9).
 *
 * Extracts `tenantId` from the `Host` header per a configured pattern
 * (`{tenant}.kblabs.ru`). Returns `null` for hosts that should NOT map
 * to a tenant — reserved subdomains, multi-level hosts, the apex
 * domain, anything that violates the slug rules.
 *
 * Slug rules: lowercase ASCII `[a-z0-9-]`, 2–40 chars, must not start
 * or end with `-`. Reserved set blocks our own infrastructure names
 * (api, www, docs, studio, mail, admin, static, cdn) from being used
 * as tenants.
 */

import { describe, expect, it } from 'vitest';
import { createTenantResolver, RESERVED_SUBDOMAINS } from '../tenant-resolver.js';

const resolver = createTenantResolver({ pattern: '{tenant}.kblabs.ru' });

describe('happy path', () => {
  it('extracts tenant from a single-level subdomain', () => {
    expect(resolver.resolve('kblabs-cloud.kblabs.ru')).toBe('kblabs-cloud');
  });

  it('lowercases the host before matching', () => {
    expect(resolver.resolve('KBLabs-Cloud.KBLabs.ru')).toBe('kblabs-cloud');
  });

  it('strips port numbers from the host', () => {
    expect(resolver.resolve('acme.kblabs.ru:443')).toBe('acme');
  });
});

describe('reserved subdomains', () => {
  it.each(Array.from(RESERVED_SUBDOMAINS))('returns null for reserved subdomain %s', (sub) => {
    expect(resolver.resolve(`${sub}.kblabs.ru`)).toBeNull();
  });
});

describe('rejected hosts', () => {
  it('returns null for the apex domain', () => {
    expect(resolver.resolve('kblabs.ru')).toBeNull();
  });

  it('returns null for multi-level subdomains', () => {
    expect(resolver.resolve('a.b.kblabs.ru')).toBeNull();
  });

  it('returns null for a different base domain', () => {
    expect(resolver.resolve('acme.evil.com')).toBeNull();
  });

  it('returns null for an empty/undefined host', () => {
    expect(resolver.resolve('')).toBeNull();
    expect(resolver.resolve(undefined)).toBeNull();
  });
});

describe('slug rules', () => {
  it('rejects too-short tenants (<2 chars)', () => {
    expect(resolver.resolve('a.kblabs.ru')).toBeNull();
  });

  it('rejects too-long tenants (>40 chars)', () => {
    const long = 'a'.repeat(41);
    expect(resolver.resolve(`${long}.kblabs.ru`)).toBeNull();
  });

  it('rejects tenants with disallowed characters', () => {
    expect(resolver.resolve('foo_bar.kblabs.ru')).toBeNull();
    expect(resolver.resolve('foo.bar.kblabs.ru')).toBeNull();
    expect(resolver.resolve('Foo!.kblabs.ru')).toBeNull();
  });

  it('rejects tenants that start or end with a hyphen', () => {
    expect(resolver.resolve('-foo.kblabs.ru')).toBeNull();
    expect(resolver.resolve('foo-.kblabs.ru')).toBeNull();
  });
});

describe('caching', () => {
  it('returns the same answer on repeated calls', () => {
    const r1 = resolver.resolve('acme.kblabs.ru');
    const r2 = resolver.resolve('acme.kblabs.ru');
    expect(r1).toBe('acme');
    expect(r2).toBe('acme');
  });
});
