/**
 * @module @kb-labs/core-platform/adapters/__tests__/contract/document-database
 *
 * Behavioural contract suite for `IDocumentDatabase`.
 *
 * Every adapter that implements `IDocumentDatabase` MUST import and run this
 * suite against a fresh instance. The same assertions hold on every driver —
 * if they don't, either the driver is wrong or the abstraction has leaked
 * and the contract must shrink to the common denominator.
 *
 * Usage from an adapter package:
 *
 * ```ts
 * import { runDocumentDatabaseContract } from '@kb-labs/core-platform/adapters/contract';
 * import { createSqliteDocumentDatabase } from '../src/index.js';
 *
 * runDocumentDatabaseContract({
 *   name: 'sqlite (file)',
 *   createInstance: async () => createSqliteDocumentDatabase({ filename: ':memory:' }),
 * });
 * ```
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type {
  IDocumentDatabase,
  IDocumentTransaction,
  BaseDocument,
} from '../database.js';

export interface ContractFactory {
  /** Human-readable name shown in the `describe` block. */
  name: string;
  /** Construct a fresh, empty database. Called once per suite run. */
  createInstance: () => Promise<IDocumentDatabase>;
  /** Optional driver-level skips for deployment limitations. */
  skip?: {
    transactions?: boolean;
    ttl?: boolean;
  };
}

interface User extends BaseDocument {
  email: string;
  name: string;
  age: number;
  active: boolean;
  tags?: string[];
  profile?: { bio?: string; score?: number };
}

interface Counter extends BaseDocument {
  key: string;
  value: number;
}

const seedUsers = async (db: IDocumentDatabase, count = 5): Promise<User[]> => {
  return db.insertMany<User>('users', Array.from({ length: count }, (_, i) => ({
    email: `user${i}@example.com`,
    name: `User ${i}`,
    age: 20 + i * 5,
    active: i % 2 === 0,
    tags: i % 2 === 0 ? ['premium'] : ['basic'],
    profile: { bio: `bio of user ${i}`, score: i * 10 },
  })));
};

export function runDocumentDatabaseContract(factory: ContractFactory): void {
  describe(`IDocumentDatabase contract — ${factory.name}`, () => {
    let db: IDocumentDatabase;

    beforeAll(async () => {
      db = await factory.createInstance();
      await db.ensureCollection('users', {
        indexes: [
          { path: 'email', unique: true },
          { path: 'age' },
          { path: 'active' },
        ],
      });
      await db.ensureCollection('counters', {
        indexes: [{ path: 'key', unique: true }],
      });
      await db.ensureCollection('events');
    });

    afterAll(async () => {
      await db.close({ drainTimeoutMs: 1000 });
    });

    beforeEach(async () => {
      await db.deleteMany<User>('users', {});
      await db.deleteMany<Counter>('counters', {});
      await db.deleteMany<BaseDocument>('events', {});
    });

    // ────────────────────────────────────────────────────────────────────────
    // Liveness
    // ────────────────────────────────────────────────────────────────────────

    describe('ping', () => {
      it('reports ok with non-negative latency', async () => {
        const result = await db.ping();
        expect(result.ok).toBe(true);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // CRUD basics
    // ────────────────────────────────────────────────────────────────────────

    describe('insertOne / findById', () => {
      it('round-trips a document with system fields populated', async () => {
        const before = Date.now();
        const inserted = await db.insertOne<User>('users', {
          email: 'alice@example.com',
          name: 'Alice',
          age: 30,
          active: true,
        });
        const after = Date.now();

        expect(inserted.id).toBeTruthy();
        expect(inserted.email).toBe('alice@example.com');
        expect(inserted.createdAt).toBeGreaterThanOrEqual(before);
        expect(inserted.createdAt).toBeLessThanOrEqual(after);
        expect(inserted.updatedAt).toBe(inserted.createdAt);

        const fetched = await db.findById<User>('users', inserted.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.email).toBe('alice@example.com');
      });

      it('returns null for a missing id', async () => {
        const result = await db.findById<User>('users', 'does-not-exist');
        expect(result).toBeNull();
      });
    });

    describe('insertMany', () => {
      it('inserts a batch and returns documents in order', async () => {
        const inserted = await seedUsers(db, 3);
        expect(inserted).toHaveLength(3);
        for (let i = 0; i < 3; i++) {
          const doc = inserted[i]!;
          expect(doc.email).toBe(`user${i}@example.com`);
          expect(doc.id).toBeTruthy();
        }
      });

      it('rolls the whole batch back if one document violates a unique index', async () => {
        await db.insertOne<User>('users', {
          email: 'dup@example.com',
          name: 'Existing',
          age: 40,
          active: true,
        });

        await expect(
          db.insertMany<User>('users', [
            { email: 'fresh@example.com', name: 'A', age: 1, active: true },
            { email: 'dup@example.com', name: 'B', age: 2, active: true },
          ]),
        ).rejects.toThrow();

        const fresh = await db.find<User>('users', { email: { $eq: 'fresh@example.com' } });
        expect(fresh).toHaveLength(0);
      });
    });

    describe('updateById / updateOne', () => {
      it('applies $set and bumps updatedAt', async () => {
        const inserted = await db.insertOne<User>('users', {
          email: 'u@example.com',
          name: 'Old',
          age: 25,
          active: true,
        });
        const originalUpdatedAt = inserted.updatedAt;
        await new Promise((r) => setTimeout(r, 5));

        const updated = await db.updateById<User>('users', inserted.id, {
          $set: { name: 'New', age: 26 },
        });

        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('New');
        expect(updated!.age).toBe(26);
        expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
      });

      it('applies $unset to remove a field', async () => {
        const inserted = await db.insertOne<User>('users', {
          email: 'u@example.com',
          name: 'Has Tags',
          age: 30,
          active: true,
          tags: ['admin'],
        });
        const updated = await db.updateById<User>('users', inserted.id, {
          $unset: { tags: 1 },
        });
        expect(updated!.tags).toBeUndefined();
      });

      it('applies $inc atomically', async () => {
        const inserted = await db.insertOne<Counter>('counters', {
          key: 'a',
          value: 0,
        });
        const updated = await db.updateById<Counter>('counters', inserted.id, {
          $inc: { value: 5 },
        });
        expect(updated!.value).toBe(5);

        const incrementedAgain = await db.updateById<Counter>('counters', inserted.id, {
          $inc: { value: -2 },
        });
        expect(incrementedAgain!.value).toBe(3);
      });

      it('returns null when updateById misses', async () => {
        const result = await db.updateById<User>('users', 'no-such-id', { $set: { name: 'X' } });
        expect(result).toBeNull();
      });

      it('upsert creates a new document when no match', async () => {
        const created = await db.updateOne<User>(
          'users',
          { email: { $eq: 'new@example.com' } },
          { $set: { email: 'new@example.com', name: 'Created', age: 1, active: true } },
          { upsert: true },
        );
        expect(created).not.toBeNull();
        expect(created!.id).toBeTruthy();
        expect(created!.name).toBe('Created');
      });

      it('upsert updates an existing document when match', async () => {
        await db.insertOne<User>('users', {
          email: 'exists@example.com', name: 'Existing', age: 99, active: false,
        });
        const updated = await db.updateOne<User>(
          'users',
          { email: { $eq: 'exists@example.com' } },
          { $set: { age: 100 } },
          { upsert: true },
        );
        expect(updated!.age).toBe(100);
        const all = await db.find<User>('users', { email: { $eq: 'exists@example.com' } });
        expect(all).toHaveLength(1);
      });

      it('updateOne without upsert returns null when no match', async () => {
        const result = await db.updateOne<User>(
          'users',
          { email: { $eq: 'missing@example.com' } },
          { $set: { name: 'Nope' } },
        );
        expect(result).toBeNull();
      });
    });

    describe('updateMany', () => {
      it('returns the number of matched documents', async () => {
        await seedUsers(db, 5);
        const n = await db.updateMany<User>(
          'users',
          { active: { $eq: true } },
          { $set: { name: 'Activated' } },
        );
        expect(n).toBeGreaterThan(0);
        const activated = await db.find<User>('users', { name: { $eq: 'Activated' } });
        expect(activated.length).toBe(n);
      });
    });

    describe('deleteById / deleteMany', () => {
      it('deleteById returns true on hit, false on miss', async () => {
        const inserted = await db.insertOne<User>('users', {
          email: 'd@example.com', name: 'D', age: 1, active: true,
        });
        expect(await db.deleteById('users', inserted.id)).toBe(true);
        expect(await db.deleteById('users', inserted.id)).toBe(false);
        expect(await db.findById('users', inserted.id)).toBeNull();
      });

      it('deleteMany returns count and removes documents', async () => {
        await seedUsers(db, 5);
        const removed = await db.deleteMany<User>('users', { active: { $eq: false } });
        expect(removed).toBeGreaterThan(0);
        const remaining = await db.find<User>('users', { active: { $eq: false } });
        expect(remaining).toHaveLength(0);
      });
    });

    describe('count', () => {
      it('counts matching documents', async () => {
        await seedUsers(db, 5);
        const total = await db.count<User>('users', {});
        expect(total).toBe(5);
        const actives = await db.count<User>('users', { active: { $eq: true } });
        expect(actives).toBeGreaterThan(0);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Filters
    // ────────────────────────────────────────────────────────────────────────

    describe('filter operators', () => {
      beforeEach(async () => {
        await seedUsers(db, 5);
      });

      it('$eq and shorthand scalar match', async () => {
        const a = await db.find<User>('users', { email: 'user0@example.com' as never });
        const b = await db.find<User>('users', { email: { $eq: 'user0@example.com' } });
        expect(a.map((u: User) => u.id).sort()).toEqual(b.map((u: User) => u.id).sort());
        expect(a).toHaveLength(1);
      });

      it('$ne', async () => {
        const result = await db.find<User>('users', { active: { $ne: true } });
        expect(result.every((u: User) => u.active === false)).toBe(true);
      });

      it('$gt / $gte / $lt / $lte', async () => {
        const gt = await db.find<User>('users', { age: { $gt: 25 } });
        expect(gt.every((u: User) => u.age > 25)).toBe(true);

        const gte = await db.find<User>('users', { age: { $gte: 25 } });
        expect(gte.every((u: User) => u.age >= 25)).toBe(true);

        const lt = await db.find<User>('users', { age: { $lt: 25 } });
        expect(lt.every((u: User) => u.age < 25)).toBe(true);

        const lte = await db.find<User>('users', { age: { $lte: 25 } });
        expect(lte.every((u: User) => u.age <= 25)).toBe(true);
      });

      it('$in / $nin', async () => {
        const inResult = await db.find<User>('users', { age: { $in: [20, 25] } });
        expect(inResult.every((u: User) => [20, 25].includes(u.age))).toBe(true);

        const ninResult = await db.find<User>('users', { age: { $nin: [20, 25] } });
        expect(ninResult.every((u: User) => ![20, 25].includes(u.age))).toBe(true);
      });

      it('$exists', async () => {
        await db.insertOne<User>('users', {
          email: 'no-tags@example.com',
          name: 'No Tags',
          age: 1,
          active: true,
        });
        const withTags = await db.find<User>('users', { tags: { $exists: true } });
        expect(withTags.every((u: User) => u.tags !== undefined)).toBe(true);

        const withoutTags = await db.find<User>('users', { tags: { $exists: false } });
        expect(withoutTags.every((u: User) => u.tags === undefined)).toBe(true);
      });

      it('$startsWith / $contains / $endsWith are case-sensitive substring match', async () => {
        const starts = await db.find<User>('users', { email: { $startsWith: 'user0' } });
        expect(starts).toHaveLength(1);
        expect(starts[0]!.email.startsWith('user0')).toBe(true);

        const contains = await db.find<User>('users', { email: { $contains: 'example' } });
        expect(contains).toHaveLength(5);

        const ends = await db.find<User>('users', { email: { $endsWith: '@example.com' } });
        expect(ends).toHaveLength(5);

        const caseMismatch = await db.find<User>('users', { email: { $startsWith: 'USER0' } });
        expect(caseMismatch).toHaveLength(0);
      });

      it('$and combines filters', async () => {
        const result = await db.find<User>('users', {
          $and: [{ active: { $eq: true } }, { age: { $gte: 25 } }],
        });
        expect(result.every((u: User) => u.active === true && u.age >= 25)).toBe(true);
      });

      it('$or combines filters', async () => {
        const result = await db.find<User>('users', {
          $or: [{ age: { $eq: 20 } }, { age: { $eq: 40 } }],
        });
        expect(result.every((u: User) => u.age === 20 || u.age === 40)).toBe(true);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Find options
    // ────────────────────────────────────────────────────────────────────────

    describe('find options', () => {
      beforeEach(async () => {
        await seedUsers(db, 5);
      });

      it('honours sort + limit + skip', async () => {
        const page1 = await db.find<User>('users', {}, {
          sort: { age: 1 },
          limit: 2,
          skip: 0,
        });
        const page2 = await db.find<User>('users', {}, {
          sort: { age: 1 },
          limit: 2,
          skip: 2,
        });
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
        expect(page1[0]!.age).toBeLessThanOrEqual(page1[1]!.age);
        expect(page2[0]!.age).toBeGreaterThan(page1[1]!.age);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Streaming
    // ────────────────────────────────────────────────────────────────────────

    describe('findStream', () => {
      it('yields all matching documents and terminates', async () => {
        await seedUsers(db, 5);
        const collected: User[] = [];
        for await (const u of db.findStream<User>('users', {}, { batchSize: 2 })) {
          collected.push(u);
        }
        expect(collected).toHaveLength(5);
      });

      it('respects AbortSignal', async () => {
        await seedUsers(db, 20);
        const controller = new AbortController();
        const collected: User[] = [];
        try {
          for await (const u of db.findStream<User>('users', {}, {
            batchSize: 2,
            signal: controller.signal,
          })) {
            collected.push(u);
            if (collected.length === 4) {
              controller.abort();
            }
          }
        } catch {
          /* swallow — abort may surface as throw or quiet stop */
        }
        // Best-effort cancellation — at most a handful past the abort point.
        expect(collected.length).toBeLessThan(20);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // bulkWrite
    // ────────────────────────────────────────────────────────────────────────

    describe('bulkWrite', () => {
      it('runs mixed operations atomically and reports counts', async () => {
        const seed = await seedUsers(db, 3);
        const result = await db.bulkWrite<User>('users', [
          { type: 'insert', doc: { email: 'bulk@example.com', name: 'Bulk', age: 99, active: true } },
          { type: 'update', filter: { id: seed[0]!.id } as never, update: { $set: { name: 'Bulked' } } },
          { type: 'delete', filter: { id: seed[1]!.id } as never },
        ]);
        expect(result.inserted).toBe(1);
        expect(result.updated).toBe(1);
        expect(result.deleted).toBe(1);
      });

      it('rolls everything back if one op fails', async () => {
        await db.insertOne<User>('users', {
          email: 'will-conflict@example.com', name: 'X', age: 1, active: true,
        });

        await expect(
          db.bulkWrite<User>('users', [
            { type: 'insert', doc: { email: 'new1@example.com', name: 'N1', age: 1, active: true } },
            { type: 'insert', doc: { email: 'will-conflict@example.com', name: 'N2', age: 1, active: true } },
          ]),
        ).rejects.toThrow();

        const partial = await db.find<User>('users', { email: { $eq: 'new1@example.com' } });
        expect(partial).toHaveLength(0);
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Transactions
    // ────────────────────────────────────────────────────────────────────────

    describe('transaction', () => {
      const skipIf = factory.skip?.transactions ? it.skip : it;

      skipIf('commits when callback resolves', async () => {
        const result = await db.transaction(async (tx: IDocumentTransaction) => {
          const a = await tx.insertOne<User>('users', {
            email: 'tx-a@example.com', name: 'A', age: 1, active: true,
          });
          const b = await tx.insertOne<User>('users', {
            email: 'tx-b@example.com', name: 'B', age: 2, active: true,
          });
          return [a.id, b.id];
        });
        const all = await db.find<User>('users', {});
        expect(all.map((u: User) => u.id).sort()).toEqual(result.sort());
      });

      skipIf('rolls back when callback throws', async () => {
        await expect(
          db.transaction(async (tx: IDocumentTransaction) => {
            await tx.insertOne<User>('users', {
              email: 'tx-rollback@example.com', name: 'RB', age: 1, active: true,
            });
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');

        const survivors = await db.find<User>('users', {
          email: { $eq: 'tx-rollback@example.com' },
        });
        expect(survivors).toHaveLength(0);
      });

      skipIf('transaction reads see uncommitted writes inside the same tx', async () => {
        await db.transaction(async (tx: IDocumentTransaction) => {
          await tx.insertOne<User>('users', {
            email: 'inside@example.com', name: 'Inside', age: 1, active: true,
          });
          const found = await tx.find<User>('users', { email: { $eq: 'inside@example.com' } });
          expect(found).toHaveLength(1);
        });
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // ensureCollection
    // ────────────────────────────────────────────────────────────────────────

    describe('ensureCollection', () => {
      it('is idempotent', async () => {
        await db.ensureCollection('idempotent', { indexes: [{ path: 'k', unique: true }] });
        await expect(
          db.ensureCollection('idempotent', { indexes: [{ path: 'k', unique: true }] }),
        ).resolves.not.toThrow();
      });

      it('unique index rejects duplicate inserts', async () => {
        await db.ensureCollection('unique_test', { indexes: [{ path: 'k', unique: true }] });
        interface KV extends BaseDocument { k: string; v: number }
        await db.insertOne<KV>('unique_test', { k: 'same', v: 1 });
        await expect(
          db.insertOne<KV>('unique_test', { k: 'same', v: 2 }),
        ).rejects.toThrow();
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // TTL
    // ────────────────────────────────────────────────────────────────────────

    describe('TTL', () => {
      const skipIf = factory.skip?.ttl ? it.skip : it;

      skipIf('expired documents become invisible to find', async () => {
        await db.ensureCollection('sessions', {
          indexes: [{ path: 'expiresAt', ttl: 0 }],
        });
        interface Session extends BaseDocument { expiresAt: number; userId: string }

        const past = Date.now() - 60_000;
        const future = Date.now() + 60_000;

        await db.insertOne<Session>('sessions', { expiresAt: past, userId: 'expired-user' });
        await db.insertOne<Session>('sessions', { expiresAt: future, userId: 'live-user' });

        // TTL sweepers are best-effort — give the driver a brief moment.
        await new Promise((r) => setTimeout(r, 50));

        const visible = await db.find<Session>('sessions', {});
        const userIds = visible.map((s: Session) => s.userId);
        expect(userIds).toContain('live-user');
        expect(userIds).not.toContain('expired-user');
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Cross-collection isolation
    // ────────────────────────────────────────────────────────────────────────

    describe('collection isolation', () => {
      it('does not bleed documents across collections', async () => {
        await db.insertOne<User>('users', {
          email: 'u@example.com', name: 'U', age: 1, active: true,
        });
        interface Event extends BaseDocument { kind: string }
        await db.insertOne<Event>('events', { kind: 'started' });

        const users = await db.find<User>('users', {});
        const events = await db.find<Event>('events', {});
        expect(users).toHaveLength(1);
        expect(events).toHaveLength(1);
        expect(users[0]!.email).toBeDefined();
        expect(events[0]!.kind).toBe('started');
      });
    });
  });
}
