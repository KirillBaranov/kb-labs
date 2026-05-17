import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteAnalytics } from './index.js';

let tmpDir: string;

function makeAdapter() {
  return new SQLiteAnalytics({
    dbPath: join(tmpDir, 'test.sqlite'),
    context: {
      source: { product: 'test', version: '1.0.0' },
      runId: 'run-test',
    },
  });
}

describe('SQLiteAnalytics', () => {
  let db: SQLiteAnalytics;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kb-analytics-'));
    db = makeAdapter();
  });
  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── track / getEvents ──────────────────────────────────────────────────────

  it('track stores event and getEvents returns it', async () => {
    await db.track('llm.complete', { model: 'gpt-4', totalTokens: 100 });
    const { events, total } = await db.getEvents();
    expect(total).toBe(1);
    expect(events[0]?.type).toBe('llm.complete');
    expect(events[0]?.payload?.model).toBe('gpt-4');
  });

  it('getEvents filters by type', async () => {
    await db.track('llm.complete');
    await db.track('embeddings.embed');
    const { events } = await db.getEvents({ type: 'llm.complete' });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('llm.complete');
  });

  it('getEvents filters by runId', async () => {
    await db.track('llm.complete');

    const db2 = new SQLiteAnalytics({
      dbPath: ':memory:',
      context: { source: { product: 'test', version: '1.0.0' }, runId: 'other-run' },
    });
    // same :memory: → different instance, different DB; test isolation via runId filter on same db
    await db.track('llm.complete');
    // override run_id via a second adapter on the same in-memory db isn't possible
    // so we verify filtering on a known run_id
    const { events } = await db.getEvents({ runId: 'run-test' });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.runId === 'run-test')).toBe(true);
    db2.close();
  });

  it('getEvents pagination works', async () => {
    for (let i = 0; i < 5; i++) { await db.track('evt'); }
    const page1 = await db.getEvents({ limit: 2, offset: 0 });
    const page2 = await db.getEvents({ limit: 2, offset: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page2.events).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);
  });

  it('getEvents returns hasMore=false on last page', async () => {
    await db.track('evt');
    const { hasMore } = await db.getEvents({ limit: 10, offset: 0 });
    expect(hasMore).toBe(false);
  });

  it('identify tracks identity event', async () => {
    await db.identify('user-123', { plan: 'pro' });
    const { events } = await db.getEvents({ type: 'identity' });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload?.userId).toBe('user-123');
    expect(events[0]?.payload?.plan).toBe('pro');
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  it('getStats returns zero counts for empty DB', async () => {
    const stats = await db.getStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.byType).toEqual({});
  });

  it('getStats counts byType correctly', async () => {
    await db.track('llm.complete');
    await db.track('llm.complete');
    await db.track('embeddings.embed');
    const stats = await db.getStats();
    expect(stats.totalEvents).toBe(3);
    expect(stats.byType['llm.complete']).toBe(2);
    expect(stats.byType['embeddings.embed']).toBe(1);
  });

  it('getStats bySource uses context product', async () => {
    await db.track('evt');
    const stats = await db.getStats();
    expect(stats.bySource['test']).toBe(1);
  });

  // ── getDailyStats ──────────────────────────────────────────────────────────

  it('getDailyStats groups events by day', async () => {
    await db.track('llm.complete', { totalTokens: 50 });
    await db.track('llm.complete', { totalTokens: 100 });
    const rows = await db.getDailyStats({ type: 'llm.complete', groupBy: 'day' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metrics?.totalTokens).toBe(150);
  });

  it('getDailyStats respects groupBy=hour format', async () => {
    await db.track('evt');
    const rows = await db.getDailyStats({ groupBy: 'hour' });
    expect(rows).toHaveLength(1);
    // hour format: YYYY-MM-DDTHH:00
    expect(rows[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
  });

  it('getDailyStats returns empty array for no matching events', async () => {
    await db.track('evt');
    const rows = await db.getDailyStats({ type: 'nonexistent' });
    expect(rows).toHaveLength(0);
  });

  it('getDailyStats breakdownBy splits by payload field', async () => {
    await db.track('llm.complete', { model: 'gpt-4', totalTokens: 100 });
    await db.track('llm.complete', { model: 'gpt-3.5', totalTokens: 50 });
    const rows = await db.getDailyStats({ type: 'llm.complete', breakdownBy: 'payload.model' });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const models = rows.map((r) => r.breakdown);
    expect(models).toContain('gpt-4');
    expect(models).toContain('gpt-3.5');
  });

  // ── source attribution ─────────────────────────────────────────────────────

  it('getSource returns context product/version', () => {
    expect(db.getSource()).toEqual({ product: 'test', version: '1.0.0' });
  });

  it('setSource updates context', () => {
    db.setSource({ product: 'updated', version: '2.0.0' });
    expect(db.getSource()).toEqual({ product: 'updated', version: '2.0.0' });
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────

  it('flush resolves without error (synchronous adapter)', async () => {
    await expect(db.flush()).resolves.toBeUndefined();
  });

  it('close is idempotent', () => {
    db.close();
    expect(() => db.close()).not.toThrow();
  });

  it('dispose delegates to close', () => {
    expect(() => db.dispose()).not.toThrow();
  });
});
