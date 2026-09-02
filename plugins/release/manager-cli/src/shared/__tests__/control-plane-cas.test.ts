/**
 * PR 6 DoD, the CAS half: "CAS drift" and the conditional-write primitives the
 * two mutable release documents (`ReleaseChannelPointer`,
 * `ReleaseSupportPolicy`) are published through.
 *
 * The claims under test are all about *refusal*, so every case asserts what the
 * store still holds afterwards as well as which error came back. A store that
 * threw and wrote anyway would satisfy a `rejects.toThrow` and lose the update
 * these primitives exist to protect.
 *
 * `FileCasStore` gets the same battery as `InMemoryCasStore` against a real temp
 * directory, following PR 4/PR 5's file-store convention: the in-memory one is
 * where the semantics are stated, the file one is where they are proven to
 * survive a filesystem.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseControlDiagnosticCode,
  canonicalSha256,
  type ReleaseSupportPolicy,
} from '@kb-labs/release-manager-contracts';

import {
  CAS_ABSENT,
  CasPreconditionError,
  FileCasStore,
  InMemoryCasStore,
  ReleaseAdapterError,
  channelPointerKey,
  isRetryable,
  publishSupportPolicy,
  supportPolicyKey,
  supportPolicySha256,
  transientFailure,
  writeDocumentWithCas,
  type CasStore,
} from '../control-plane/index.js';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-cas-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

/** Identity digest: these cases are about preconditions, not about parsing. */
const identity = (body: string): string => canonicalSha256({ body });

const KEY = 'channels/stable.json';

// ── the raw conditional-write contract ───────────────────────────────────────

describe.each<[string, () => CasStore]>([
  ['InMemoryCasStore', () => new InMemoryCasStore()],
  ['FileCasStore', () => new FileCasStore(tempDir())],
])('CAS-01 %s: putIfMatch honours its precondition', (_label, make) => {
  it('accepts CAS_ABSENT for a first-ever write and refuses it for a second', async () => {
    const store = make();

    const first = await store.putIfMatch(KEY, 'one', CAS_ABSENT);
    expect(first.etag).toMatch(/^[a-f0-9]{64}$/);
    expect((await store.read(KEY))?.body).toBe('one');

    // A second "there is nothing here yet" write is precisely the lost update
    // the absent sentinel exists to stop.
    await expect(store.putIfMatch(KEY, 'two', CAS_ABSENT)).rejects.toBeInstanceOf(CasPreconditionError);
    expect((await store.read(KEY))?.body).toBe('one');
  });

  it('accepts the current etag and refuses a stale one without overwriting', async () => {
    const store = make();
    const first = await store.putIfMatch(KEY, 'one', CAS_ABSENT);
    const second = await store.putIfMatch(KEY, 'two', first.etag);

    await expect(store.putIfMatch(KEY, 'three', first.etag)).rejects.toMatchObject({
      name: 'CasPreconditionError',
      retryable: false,
      code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch,
    });
    expect((await store.read(KEY))?.body).toBe('two');
    expect(second.etag).not.toBe(first.etag);
  });

  it('refuses a conditional delete on a stale etag', async () => {
    const store = make();
    const first = await store.putIfMatch(KEY, 'one', CAS_ABSENT);
    await store.putIfMatch(KEY, 'two', first.etag);

    await expect(store.deleteIfMatch(KEY, first.etag)).rejects.toBeInstanceOf(CasPreconditionError);
    expect(await store.read(KEY)).not.toBeNull();
  });

  it('reads an absent key as null rather than throwing', async () => {
    expect(await make().read('channels/never-written.json')).toBeNull();
  });
});

describe('CAS-02 CasPreconditionError classification', () => {
  it('is a terminal ReleaseAdapterError, never a flake to retry', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'someone-elses-bytes');

    const error = await store.putIfMatch(KEY, 'ours', CAS_ABSENT).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReleaseAdapterError);
    expect(isRetryable(error)).toBe(false);
    expect((error as CasPreconditionError).key).toBe(KEY);
    expect((error as Error).message).toContain('<absent>');
  });
});

// ── FileCasStore durability ──────────────────────────────────────────────────

describe('CAS-03 FileCasStore durability', () => {
  it('publishes through a rename, never leaving a torn or temp file behind', async () => {
    const root = tempDir();
    const store = new FileCasStore(root);

    const written = await store.putIfMatch(KEY, '{"a":1}', CAS_ABSENT);

    expect(store.keys()).toEqual([KEY]);
    expect(readFileSync(join(root, KEY), 'utf8')).toBe('{"a":1}');
    expect(readdirSync(join(root, 'channels')).filter(name => name.includes('.tmp-'))).toEqual([]);
    expect(written.etag).toBe((await store.read(KEY))!.etag);
  });

  it('recomputes the etag from bytes, so an out-of-band edit reads as drift', async () => {
    const root = tempDir();
    const store = new FileCasStore(root);
    const written = await store.putIfMatch(KEY, 'ours', CAS_ABSENT);

    // Somebody wrote to the endpoint outside the release train.
    writeFileSync(join(root, KEY), 'theirs');

    await expect(store.putIfMatch(KEY, 'ours-v2', written.etag)).rejects.toBeInstanceOf(CasPreconditionError);
    expect(readFileSync(join(root, KEY), 'utf8')).toBe('theirs');
  });

  it('refuses a key that would escape the store root', async () => {
    const store = new FileCasStore(tempDir());
    await expect(store.putIfMatch('../escaped.json', 'x', CAS_ABSENT)).rejects.toThrow(/escapes the store root/);
  });
});

// ── writeDocumentWithCas: the one write primitive ────────────────────────────

describe('CAS-04 writeDocumentWithCas preconditions', () => {
  it('writes when the content precondition matches the live document', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'previous');

    const outcome = await writeDocumentWithCas({
      store, key: KEY, body: 'next', sha256: identity('next'),
      expectedPreviousSha256: identity('previous'),
      digestOf: identity,
    });

    expect(outcome).toMatchObject({ reused: false, previousSha256: identity('previous'), sha256: identity('next') });
    expect(store.writes).toHaveLength(1);
  });

  it('treats `null` as "no document has ever been published" for a first write', async () => {
    const store = new InMemoryCasStore();

    const outcome = await writeDocumentWithCas({
      store, key: KEY, body: 'first', sha256: identity('first'),
      expectedPreviousSha256: null,
      digestOf: identity,
    });

    expect(outcome).toMatchObject({ reused: false, previousSha256: null });
    expect(store.writes[0]).toMatchObject({ key: KEY, expected: '<absent>' });
  });

  it('refuses a first write whose "nothing published yet" precondition is already false', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'somebody-got-there-first');

    await expect(writeDocumentWithCas({
      store, key: KEY, body: 'first', sha256: identity('first'),
      expectedPreviousSha256: null,
      digestOf: identity,
    })).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch, retryable: false });
    expect(store.writes).toEqual([]);
  });

  it('CAS drift: refuses rather than overwriting when the live document is foreign', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'somebody-elses-pointer');

    const error = await writeDocumentWithCas({
      store, key: KEY, body: 'next', sha256: identity('next'),
      expectedPreviousSha256: identity('previous'),
      digestOf: identity,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReleaseAdapterError);
    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch, retryable: false });
    expect((error as Error).message).toMatch(/drift, not a conflict to resolve here/);
    // The refusal is the point: nothing was written.
    expect(store.writes).toEqual([]);
    expect((await store.read(KEY))?.body).toBe('somebody-elses-pointer');
  });

  it('is idempotent when the live document is already byte-identical', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'next');

    const outcome = await writeDocumentWithCas({
      store, key: KEY, body: 'next', sha256: identity('next'),
      // A stale precondition is irrelevant once the desired state is observed:
      // this is the crash-between-write-and-acknowledgement replay.
      expectedPreviousSha256: identity('previous'),
      digestOf: identity,
    });

    expect(outcome.reused).toBe(true);
    expect(store.writes).toEqual([]);
  });

  it('loses the read-modify-write race to a concurrent writer instead of clobbering it', async () => {
    const store = new InMemoryCasStore();
    const seeded = store.seed(KEY, 'previous');
    // Between our read and our write, somebody else lands a different value:
    // the content precondition passed, and only the etag catches this.
    store.failNext(KEY, () => { throw new CasPreconditionError(KEY, seeded.etag, 'e'.repeat(64)); });

    await expect(writeDocumentWithCas({
      store, key: KEY, body: 'next', sha256: identity('next'),
      expectedPreviousSha256: identity('previous'),
      digestOf: identity,
    })).rejects.toBeInstanceOf(CasPreconditionError);
    expect((await store.read(KEY))?.body).toBe('previous');
  });

  it('propagates a store outage as a retryable failure, distinct from drift', async () => {
    const store = new InMemoryCasStore();
    store.seed(KEY, 'previous');
    store.failNext(KEY, () => { throw transientFailure('pointer endpoint returned 503'); });

    const error = await writeDocumentWithCas({
      store, key: KEY, body: 'next', sha256: identity('next'),
      expectedPreviousSha256: identity('previous'),
      digestOf: identity,
    }).catch((thrown: unknown) => thrown);

    expect(isRetryable(error)).toBe(true);
    expect(error).toMatchObject({ code: ReleaseControlDiagnosticCode.DeliveryTransient });
  });

  it('behaves identically against the file-backed store', async () => {
    const store = new FileCasStore(tempDir());
    await writeDocumentWithCas({
      store, key: KEY, body: 'first', sha256: identity('first'),
      expectedPreviousSha256: null, digestOf: identity,
    });

    const replay = await writeDocumentWithCas({
      store, key: KEY, body: 'first', sha256: identity('first'),
      expectedPreviousSha256: null, digestOf: identity,
    });
    expect(replay.reused).toBe(true);

    await expect(writeDocumentWithCas({
      store, key: KEY, body: 'second', sha256: identity('second'),
      expectedPreviousSha256: identity('something-else'), digestOf: identity,
    })).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch });
    expect((await store.read(KEY))?.body).toBe('first');
  });
});

// ── the second mutable document ──────────────────────────────────────────────

function policy(overrides: Partial<ReleaseSupportPolicy> = {}): ReleaseSupportPolicy {
  return {
    schema: 'kb.release-support/1',
    contract: 'kb.release/1',
    minimumSupported: 'platform-2.117.0',
    supported: ['platform-2.117.0', 'platform-2.118.0'],
    retired: [{ releaseId: 'platform-2.116.0', reason: 'superseded' }],
    legacyNotice: 'Releases before the minimum are unsupported.',
    generatedAt: '2026-08-31T09:00:00Z',
    signature: null,
    ...overrides,
  };
}

const asBytes = (value: ReleaseSupportPolicy): string => `${JSON.stringify(value, null, 2)}\n`;

describe('CAS-05 support policy publication', () => {
  it('publishes the exact sealed bytes at the shared support key', async () => {
    const store = new InMemoryCasStore();
    const sealed = policy();
    const body = asBytes(sealed);

    const outcome = await publishSupportPolicy({
      store, body, expectedSha256: supportPolicySha256(sealed), expectedPreviousSha256: null,
    });

    expect(outcome).toMatchObject({ key: supportPolicyKey(), reused: false });
    expect((await store.read(supportPolicyKey()))?.body).toBe(body);
    // Byte-for-byte, not a re-serialisation: the digest was granted over these bytes.
    expect(store.writes[0]!.body).toBe(body);
  });

  it('refuses a substituted policy whose composition differs from the authorised digest', async () => {
    const store = new InMemoryCasStore();
    const authorised = supportPolicySha256(policy());
    // A perfectly valid document — with a different `supported` list.
    const substituted = asBytes(policy({ supported: ['platform-2.117.0', 'platform-2.118.0', 'platform-2.119.0'] }));

    await expect(publishSupportPolicy({ store, body: substituted, expectedSha256: authorised }))
      .rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.EvidenceMismatch, retryable: false });
    expect(store.writes).toEqual([]);
  });

  it('rejects bytes that are not a kb.release-support/1 document at all', async () => {
    const store = new InMemoryCasStore();
    await expect(publishSupportPolicy({ store, body: '{"schema":"nope"}', expectedSha256: 'a'.repeat(64) }))
      .rejects.toThrow(/not a valid kb\.release-support\/1 document/);
    expect(store.writes).toEqual([]);
  });

  it('replays idempotently and refuses on drift, exactly like the pointer', async () => {
    const store = new InMemoryCasStore();
    const sealed = policy();
    const body = asBytes(sealed);
    const digest = supportPolicySha256(sealed);
    await publishSupportPolicy({ store, body, expectedSha256: digest, expectedPreviousSha256: null });

    const replay = await publishSupportPolicy({ store, body, expectedSha256: digest, expectedPreviousSha256: null });
    expect(replay.reused).toBe(true);
    expect(store.writes).toHaveLength(1);

    const next = policy({ minimumSupported: 'platform-2.118.0', generatedAt: '2026-09-01T09:00:00Z' });
    await expect(publishSupportPolicy({
      store,
      body: asBytes(next),
      expectedSha256: supportPolicySha256(next),
      // The plan believed something else was published.
      expectedPreviousSha256: 'f'.repeat(64),
    })).rejects.toMatchObject({ code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch });
    expect(store.writes).toHaveLength(1);
  });

  it('never shares a key with a channel pointer', () => {
    expect(supportPolicyKey()).not.toBe(channelPointerKey('stable'));
    expect(channelPointerKey('stable')).not.toBe(channelPointerKey('canary'));
  });
});
