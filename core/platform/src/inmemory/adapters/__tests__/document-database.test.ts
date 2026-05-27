import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
} from '../document-database.js';

interface User {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  age: number;
  email?: string;
  tags?: string[];
}

describe('InMemoryDocumentDatabase', () => {
  let db: InMemoryDocumentDatabase;

  beforeEach(() => {
    db = new InMemoryDocumentDatabase();
  });

  describe('insert / findById / count', () => {
    it('insertOne assigns id + timestamps', async () => {
      const doc = await db.insertOne<User>('users', { name: 'a', age: 1 });
      expect(doc.id).toBeTruthy();
      expect(typeof doc.createdAt).toBe('number');
      expect(doc.updatedAt).toBe(doc.createdAt);
      expect(doc.name).toBe('a');
    });

    it('insertOne returns a clone — internal mutation does not leak', async () => {
      const doc = await db.insertOne<User>('users', { name: 'a', age: 1 });
      doc.name = 'mutated';
      const fetched = await db.findById<User>('users', doc.id);
      expect(fetched?.name).toBe('a');
    });

    it('insertMany inserts batch', async () => {
      const docs = await db.insertMany<User>('users', [
        { name: 'a', age: 1 },
        { name: 'b', age: 2 },
      ]);
      expect(docs).toHaveLength(2);
      expect(await db.count<User>('users', {})).toBe(2);
    });

    it('findById returns null when absent', async () => {
      expect(await db.findById<User>('users', 'nope')).toBeNull();
    });
  });

  describe('find with filters', () => {
    beforeEach(async () => {
      await db.insertMany<User>('users', [
        { name: 'alice', age: 30 },
        { name: 'bob', age: 25 },
        { name: 'carol', age: 40 },
      ]);
    });

    it('equality on scalar', async () => {
      const res = await db.find<User>('users', { name: 'alice' });
      expect(res.map((u) => u.name)).toEqual(['alice']);
    });

    it('$gt / $gte / $lt / $lte', async () => {
      expect((await db.find<User>('users', { age: { $gt: 30 } })).map((u) => u.name)).toEqual(['carol']);
      expect((await db.find<User>('users', { age: { $gte: 30 } })).map((u) => u.name).sort()).toEqual(['alice', 'carol']);
      expect((await db.find<User>('users', { age: { $lt: 30 } })).map((u) => u.name)).toEqual(['bob']);
      expect((await db.find<User>('users', { age: { $lte: 30 } })).map((u) => u.name).sort()).toEqual(['alice', 'bob']);
    });

    it('$ne / $in / $nin', async () => {
      expect((await db.find<User>('users', { name: { $ne: 'alice' } })).map((u) => u.name).sort()).toEqual(['bob', 'carol']);
      expect((await db.find<User>('users', { name: { $in: ['alice', 'bob'] } })).map((u) => u.name).sort()).toEqual(['alice', 'bob']);
      expect((await db.find<User>('users', { name: { $nin: ['alice'] } })).map((u) => u.name).sort()).toEqual(['bob', 'carol']);
    });

    it('$startsWith / $contains / $endsWith on strings', async () => {
      expect((await db.find<User>('users', { name: { $startsWith: 'a' } })).map((u) => u.name)).toEqual(['alice']);
      expect((await db.find<User>('users', { name: { $contains: 'o' } })).map((u) => u.name).sort()).toEqual(['bob', 'carol']);
      expect((await db.find<User>('users', { name: { $endsWith: 'b' } })).map((u) => u.name)).toEqual(['bob']);
    });

    it('$exists', async () => {
      await db.insertOne<User>('users', { name: 'dave', age: 50, email: 'd@x' });
      const withEmail = await db.find<User>('users', { email: { $exists: true } });
      expect(withEmail.map((u) => u.name)).toEqual(['dave']);
      const withoutEmail = await db.find<User>('users', { email: { $exists: false } });
      expect(withoutEmail.map((u) => u.name).sort()).toEqual(['alice', 'bob', 'carol']);
    });

    it('$and / $or composition', async () => {
      const andRes = await db.find<User>('users', {
        $and: [{ age: { $gte: 30 } }, { name: { $startsWith: 'a' } }],
      });
      expect(andRes.map((u) => u.name)).toEqual(['alice']);

      const orRes = await db.find<User>('users', {
        $or: [{ name: 'alice' }, { name: 'bob' }],
      });
      expect(orRes.map((u) => u.name).sort()).toEqual(['alice', 'bob']);
    });

    it('sort / skip / limit', async () => {
      const asc = await db.find<User>('users', {}, { sort: { age: 1 } });
      expect(asc.map((u) => u.age)).toEqual([25, 30, 40]);
      const desc = await db.find<User>('users', {}, { sort: { age: -1 } });
      expect(desc.map((u) => u.age)).toEqual([40, 30, 25]);
      const paged = await db.find<User>('users', {}, { sort: { age: 1 }, skip: 1, limit: 1 });
      expect(paged.map((u) => u.age)).toEqual([30]);
    });

    it('projection (include)', async () => {
      const res = await db.find<User, { name: string }>('users', { name: 'alice' }, {
        project: { name: 1 } as never,
      });
      expect(res[0]).toEqual({ name: 'alice' });
    });

    it('projection (exclude)', async () => {
      const res = await db.find<User>('users', { name: 'alice' }, {
        project: { age: 0 } as never,
      });
      expect(res[0]).not.toHaveProperty('age');
      expect(res[0]).toHaveProperty('name', 'alice');
    });

    it('rejects mixed include/exclude projection', async () => {
      await expect(
        db.find<User>('users', {}, { project: { name: 1, age: 0 } as never }),
      ).rejects.toThrow(/include.*exclude/);
    });
  });

  describe('updates', () => {
    let aliceId: string;

    beforeEach(async () => {
      const a = await db.insertOne<User>('users', { name: 'alice', age: 30 });
      aliceId = a.id;
    });

    it('$set updates fields and bumps updatedAt', async () => {
      const before = await db.findById<User>('users', aliceId);
      await new Promise((r) => setTimeout(r, 2));
      const updated = await db.updateOne<User>('users', { id: aliceId }, { $set: { age: 31 } });
      expect(updated?.age).toBe(31);
      expect((updated?.updatedAt ?? 0) >= (before?.updatedAt ?? 0)).toBe(true);
    });

    it('$unset removes fields', async () => {
      await db.updateOne<User>('users', { id: aliceId }, { $set: { email: 'a@x' } });
      const cleared = await db.updateOne<User>('users', { id: aliceId }, { $unset: { email: true } as never });
      expect(cleared?.email).toBeUndefined();
    });

    it('$inc increments numeric fields', async () => {
      const updated = await db.updateOne<User>('users', { id: aliceId }, { $inc: { age: 5 } as never });
      expect(updated?.age).toBe(35);
    });

    it('$inc rejects non-finite deltas', async () => {
      await expect(
        db.updateOne<User>('users', { id: aliceId }, { $inc: { age: NaN } as never }),
      ).rejects.toThrow(/finite number/);
    });

    it('updateOne returns null when nothing matches and upsert is false', async () => {
      expect(await db.updateOne<User>('users', { name: 'ghost' }, { $set: { age: 99 } })).toBeNull();
    });

    it('updateOne with upsert creates the document', async () => {
      const created = await db.updateOne<User>(
        'users',
        { name: 'newbie' },
        { $set: { age: 1 } },
        { upsert: true },
      );
      expect(created?.name).toBe('newbie');
      expect(created?.age).toBe(1);
    });

    it('updateMany returns the count of modified docs', async () => {
      await db.insertOne<User>('users', { name: 'a2', age: 30 });
      const n = await db.updateMany<User>('users', { age: 30 }, { $set: { tags: ['x'] } as never });
      expect(n).toBe(2);
    });

    it('updateById returns null for missing id', async () => {
      expect(await db.updateById<User>('users', 'nope', { $set: { age: 1 } })).toBeNull();
    });
  });

  describe('deletes', () => {
    it('deleteMany returns count and removes documents', async () => {
      await db.insertMany<User>('users', [
        { name: 'a', age: 1 },
        { name: 'b', age: 2 },
        { name: 'c', age: 2 },
      ]);
      const n = await db.deleteMany<User>('users', { age: 2 });
      expect(n).toBe(2);
      expect(await db.count<User>('users', {})).toBe(1);
    });

    it('deleteById returns whether the doc existed', async () => {
      const doc = await db.insertOne<User>('users', { name: 'a', age: 1 });
      expect(await db.deleteById('users', doc.id)).toBe(true);
      expect(await db.deleteById('users', doc.id)).toBe(false);
    });
  });

  describe('findStream', () => {
    it('yields filtered docs', async () => {
      await db.insertMany<User>('users', [
        { name: 'a', age: 1 },
        { name: 'b', age: 2 },
      ]);
      const seen: string[] = [];
      for await (const doc of db.findStream<User>('users', { name: 'a' })) {
        seen.push(doc.name);
      }
      expect(seen).toEqual(['a']);
    });
  });

  describe('indexes & unique constraint', () => {
    beforeEach(async () => {
      await db.ensureCollection('users', {
        indexes: [{ path: 'email', unique: true }],
      });
    });

    it('rejects duplicate inserts on a unique field', async () => {
      await db.insertOne<User>('users', { name: 'a', age: 1, email: 'x@y' });
      await expect(
        db.insertOne<User>('users', { name: 'b', age: 2, email: 'x@y' }),
      ).rejects.toThrow(/unique index violation/);
    });

    it('rejects duplicates within insertMany batch', async () => {
      await expect(
        db.insertMany<User>('users', [
          { name: 'a', age: 1, email: 'same@y' },
          { name: 'b', age: 2, email: 'same@y' },
        ]),
      ).rejects.toThrow(/unique index violation/);
    });

    it('allows update that keeps the same unique value', async () => {
      const a = await db.insertOne<User>('users', { name: 'a', age: 1, email: 'a@y' });
      const updated = await db.updateOne<User>(
        'users',
        { id: a.id },
        { $set: { age: 2 } },
      );
      expect(updated?.age).toBe(2);
    });

    it('rejects update that would clash with another doc', async () => {
      await db.insertOne<User>('users', { name: 'a', age: 1, email: 'a@y' });
      const b = await db.insertOne<User>('users', { name: 'b', age: 2, email: 'b@y' });
      await expect(
        db.updateOne<User>('users', { id: b.id }, { $set: { email: 'a@y' } }),
      ).rejects.toThrow(/unique index violation/);
    });

    it('ensureCollection is idempotent — does not duplicate identical indexes', async () => {
      await db.ensureCollection('users', { indexes: [{ path: 'email', unique: true }] });
      // Still rejects duplicates (proves the index is in effect).
      await db.insertOne<User>('users', { name: 'a', age: 1, email: 'x@y' });
      await expect(
        db.insertOne<User>('users', { name: 'b', age: 2, email: 'x@y' }),
      ).rejects.toThrow(/unique/);
    });
  });

  describe('bulkWrite', () => {
    it('applies inserts, updates and deletes', async () => {
      const a = await db.insertOne<User>('users', { name: 'a', age: 1 });
      const result = await db.bulkWrite<User>('users', [
        { type: 'insert', doc: { name: 'b', age: 2 } as never },
        { type: 'update', filter: { id: a.id }, update: { $set: { age: 99 } } },
        { type: 'delete', filter: { name: 'a' } },
      ]);
      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(1);
    });

    it('rolls back on failure', async () => {
      await db.ensureCollection('users', { indexes: [{ path: 'email', unique: true }] });
      await db.insertOne<User>('users', { name: 'a', age: 1, email: 'a@y' });
      await expect(
        db.bulkWrite<User>('users', [
          { type: 'insert', doc: { name: 'b', age: 2 } as never },
          { type: 'insert', doc: { name: 'c', age: 3, email: 'a@y' } as never },
        ]),
      ).rejects.toThrow(/unique/);
      expect(await db.count<User>('users', {})).toBe(1);
    });
  });

  describe('transaction', () => {
    it('commits on success', async () => {
      await db.transaction(async (tx) => {
        await tx.insertOne<User>('users', { name: 'a', age: 1 });
        await tx.insertOne<User>('users', { name: 'b', age: 2 });
      });
      expect(await db.count<User>('users', {})).toBe(2);
    });

    it('rolls back on throw', async () => {
      await db.insertOne<User>('users', { name: 'existing', age: 0 });
      await expect(
        db.transaction(async (tx) => {
          await tx.insertOne<User>('users', { name: 'tmp', age: 1 });
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await db.count<User>('users', {})).toBe(1);
      expect((await db.find<User>('users', { name: 'tmp' }))).toEqual([]);
    });
  });

  describe('lifecycle', () => {
    it('ping is ok while open', async () => {
      expect((await db.ping()).ok).toBe(true);
    });

    it('close blocks subsequent operations', async () => {
      await db.close();
      expect((await db.ping()).ok).toBe(false);
      await expect(db.find<User>('users', {})).rejects.toThrow(/closed/);
    });
  });

  it('factory returns a fresh instance and honours custom now()', async () => {
    const d = createInMemoryDocumentDatabase({ now: () => 42 });
    const doc = await d.insertOne<User>('users', { name: 'x', age: 1 });
    expect(doc.createdAt).toBe(42);
    expect(doc.updatedAt).toBe(42);
  });
});
