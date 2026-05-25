import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSqliteDocumentDatabase, SqliteDocumentDatabase } from '@kb-labs/adapters-sqlite';
import { EnvironmentLeaseStore } from '../environment-lease-store.js';

describe('EnvironmentLeaseStore (document-backed)', () => {
  let docs: SqliteDocumentDatabase;
  let store: EnvironmentLeaseStore;

  beforeEach(async () => {
    docs = createSqliteDocumentDatabase({ filename: ':memory:', ttlSweepIntervalMs: 0 });
    store = new EnvironmentLeaseStore(docs);
    await store.ensureSchema();
  });

  afterEach(async () => {
    await docs.close();
  });

  it('upserts a lease and round-trips through findExpiredActiveLeases', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await store.upsertLease({
      environmentId: 'env-1',
      runId: 'run-1',
      status: 'active',
      provider: 'docker-cli',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: past,
      metadataJson: '{"k":"v"}',
    });

    const expired = await store.findExpiredActiveLeases(new Date().toISOString());
    expect(expired).toHaveLength(1);
    expect(expired[0]?.environmentId).toBe('env-1');
    expect(expired[0]?.runId).toBe('run-1');
    expect(expired[0]?.metadataJson).toBe('{"k":"v"}');
  });

  it('upsert replaces an existing lease rather than duplicating it', async () => {
    const base = {
      environmentId: 'env-1',
      status: 'active' as const,
      provider: 'docker-cli',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await store.upsertLease(base);
    await store.upsertLease({ ...base, runId: 'run-2', status: 'terminated' });

    const expired = await store.findExpiredActiveLeases(
      new Date(Date.now() + 120_000).toISOString(),
    );
    // The terminated one should not show up under "active".
    expect(expired).toHaveLength(0);
  });

  it('markTerminated flips status and appends a terminated event when reason given', async () => {
    await store.upsertLease({
      environmentId: 'env-1',
      status: 'active',
      provider: 'docker-cli',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const releasedAt = new Date().toISOString();
    await store.markTerminated('env-1', releasedAt, 'shutdown');

    const stillActive = await store.findExpiredActiveLeases(
      new Date(Date.now() + 120_000).toISOString(),
    );
    expect(stillActive).toHaveLength(0);
  });

  it('appendEvent rejects duplicate ids (unique index on eventId)', async () => {
    await store.appendEvent({
      id: 'e-1',
      environmentId: 'env-1',
      type: 'environment.started',
      at: new Date().toISOString(),
    });
    await expect(
      store.appendEvent({
        id: 'e-1',
        environmentId: 'env-1',
        type: 'environment.terminated',
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow();
  });

  it('ensureSchema is idempotent — repeated calls do not throw', async () => {
    await expect(store.ensureSchema()).resolves.not.toThrow();
    await expect(store.ensureSchema()).resolves.not.toThrow();
  });
});
