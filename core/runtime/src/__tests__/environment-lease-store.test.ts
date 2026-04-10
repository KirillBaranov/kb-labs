import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvironmentLeaseStore } from '../environment-lease-store.js';
import type { ISQLDatabase, SQLQueryResult } from '@kb-labs/core-platform/adapters';

describe('EnvironmentLeaseStore', () => {
  let db: ISQLDatabase;
  let queryMock: ReturnType<typeof vi.fn>;
  let execMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn(async (): Promise<SQLQueryResult> => ({
      rows: [],
      rowCount: 0,
    }));
    execMock = vi.fn(async () => undefined);

    db = {
      query: queryMock,
      transaction: vi.fn(),
      close: vi.fn(async () => undefined),
      exec: execMock,
    } as unknown as ISQLDatabase;
  });

  it('ensures schema and upserts lease', async () => {
    const store = new EnvironmentLeaseStore(db);
    await store.upsertLease({
      environmentId: 'env-1',
      runId: 'run-1',
      status: 'active',
      provider: 'docker-cli',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      metadataJson: '{"k":"v"}',
    });

    expect(execMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('maps expired rows from query result', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          environment_id: 'env-1',
          run_id: 'run-1',
          status: 'active',
          provider: 'docker-cli',
          acquired_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2026-01-01T01:00:00.000Z',
          released_at: null,
          metadata_json: null,
        },
      ],
      rowCount: 1,
    } satisfies SQLQueryResult);

    const store = new EnvironmentLeaseStore(db);
    const leases = await store.findExpiredActiveLeases('2026-01-01T02:00:00.000Z');
    expect(leases).toHaveLength(1);
    expect(leases[0]?.environmentId).toBe('env-1');
    expect(leases[0]?.runId).toBe('run-1');
  });
});

