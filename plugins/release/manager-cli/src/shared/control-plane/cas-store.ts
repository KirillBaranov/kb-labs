/**
 * The conditional-write object store behind the two mutable release documents
 * (execution plan §3.1, cutover §6A.5 step 4).
 *
 * ## Why this interface exists at all
 *
 * Everything else the release train publishes is immutable and therefore needs
 * no coordination: an npm tarball, a launcher binary, a release index and a
 * release descriptor are written once under an identity that already names
 * their bytes, so "publish" degenerates to "publish or observe it is already
 * there". Exactly two documents are mutable — `ReleaseChannelPointer` and
 * `ReleaseSupportPolicy` — and both are read by consumers who must never see a
 * torn or rolled-back value. §3.1 puts them in an S3-compatible object store
 * with `If-Match`/ETag conditional PUT for that reason, and rejects GitHub
 * Releases as their home because delete+upload is not atomic.
 *
 * ## Why the interface is this narrow
 *
 * Three operations, opaque etags, string bodies. The delivery logic above it
 * never learns which provider it is talking to, so the sandboxed fake in the
 * tests and the eventual real S3 client are substitutable without a line
 * changing in `ci-delivery.ts` — the same trick PR 4 used for `ReleaseLedgerStore`
 * and PR 5 for `ReceiptStore`. There is deliberately no `list`, no `copy` and no
 * unconditional `put`: an unconditional write is precisely the operation §6A.5
 * forbids ("refuse a blind overwrite on drift"), so it is not in the vocabulary.
 *
 * ## Two preconditions, not one
 *
 * A caller supplies both the *content* digest it believes is currently
 * published (`expectedPreviousPointerSha256`, sealed into an approved plan) and,
 * separately, the etag it just read. They guard different things and neither
 * subsumes the other:
 *
 * - the digest proves the document the operator approved against is the one
 *   still published — a semantic check the store knows nothing about;
 * - the etag closes the read-modify-write race between that check and the
 *   write — a concurrency check the plan knows nothing about.
 *
 * `writeDocumentWithCas` performs them in that order, which is why drift
 * produces a *typed* refusal rather than a lost update.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';

import { ReleaseAdapterError } from './adapters.js';

export interface CasObject {
  body: string;
  /** Opaque provider token. Never parsed, compared only for equality. */
  etag: string;
}

/**
 * Sentinel for "this key must not exist yet".
 *
 * A distinct value rather than `null` because `null` is already a meaningful
 * *pointer digest* ("no pointer has ever been published for this channel"), and
 * conflating "no previous content" with "no previous object" is how a first
 * publication silently overwrites a concurrent one.
 */
export const CAS_ABSENT = Symbol('cas-absent');
export type CasPrecondition = string | typeof CAS_ABSENT;

/**
 * A conditional-write object store.
 *
 * Implementations must be read-after-write consistent, and `putIfMatch` must be
 * atomic with respect to its precondition. §3.1 requires both to be *validated*
 * against a candidate provider rather than accepted from its documentation.
 */
export interface CasStore {
  read(key: string): Promise<CasObject | null>;
  /** Writes only if the stored etag equals `expected`. Throws `CasPreconditionError` otherwise. */
  putIfMatch(key: string, body: string, expected: CasPrecondition): Promise<CasObject>;
  /** Deletes only if the stored etag equals `expected`. */
  deleteIfMatch(key: string, expected: CasPrecondition): Promise<void>;
}

/**
 * The conditional write was refused because the world moved.
 *
 * Non-retryable on purpose: a retry would re-read, find the same foreign value
 * and either fail again or — worse, if the retry re-derived its precondition —
 * overwrite it. Drift is a fact to report, not a flake to absorb.
 */
export class CasPreconditionError extends ReleaseAdapterError {
  readonly key: string;

  constructor(key: string, expected: CasPrecondition, found: string | null) {
    super(
      `conditional write refused for ${key}: expected ${expected === CAS_ABSENT ? '<absent>' : expected}, `
      + `store holds ${found ?? '<absent>'}`,
      { retryable: false, code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch },
    );
    this.name = 'CasPreconditionError';
    this.key = key;
  }
}

function etagOf(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function matches(expected: CasPrecondition, current: CasObject | null): boolean {
  return expected === CAS_ABSENT ? current === null : current?.etag === expected;
}

/**
 * In-memory store for tests.
 *
 * `writes` is the assertion surface for the delivery tests: "the pointer was
 * written once" and "compensation wrote the previous bytes back before anything
 * else" are both statements about the *sequence* of conditional writes, not
 * about the final value, and only a recorded log can distinguish them from a
 * store that happens to end up in the right state.
 */
export class InMemoryCasStore implements CasStore {
  private readonly objects = new Map<string, CasObject>();
  readonly writes: Array<{ key: string; body: string; expected: string }> = [];
  readonly reads: string[] = [];
  /** Queued failures per key, consumed one per call — used to script outages. */
  private readonly faults = new Map<string, Array<() => never>>();

  seed(key: string, body: string): CasObject {
    const object = { body, etag: etagOf(body) };
    this.objects.set(key, object);
    return object;
  }

  failNext(key: string, error: () => never): this {
    this.faults.set(key, [...(this.faults.get(key) ?? []), error]);
    return this;
  }

  private trip(key: string): void {
    const queue = this.faults.get(key);
    const next = queue?.shift();
    if (next) { next(); }
  }

  async read(key: string): Promise<CasObject | null> {
    this.reads.push(key);
    return this.objects.get(key) ?? null;
  }

  async putIfMatch(key: string, body: string, expected: CasPrecondition): Promise<CasObject> {
    this.trip(key);
    const current = this.objects.get(key) ?? null;
    if (!matches(expected, current)) { throw new CasPreconditionError(key, expected, current?.etag ?? null); }
    const object = { body, etag: etagOf(body) };
    this.objects.set(key, object);
    this.writes.push({ key, body, expected: expected === CAS_ABSENT ? '<absent>' : expected });
    return object;
  }

  async deleteIfMatch(key: string, expected: CasPrecondition): Promise<void> {
    this.trip(key);
    const current = this.objects.get(key) ?? null;
    if (!matches(expected, current)) { throw new CasPreconditionError(key, expected, current?.etag ?? null); }
    this.objects.delete(key);
  }
}

/**
 * Local-filesystem store.
 *
 * Not a production backend — it is what makes a `--dry-run` and a local
 * rehearsal exercise the *same* CAS code path the real endpoint will, including
 * the precondition failures. The etag is the body digest and the write is a
 * rename over a temp file, so the conditional check and the swap are as close to
 * atomic as a single filesystem gets.
 */
export class FileCasStore implements CasStore {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    const safe = key.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^\/+/, '');
    const target = resolve(this.root, safe);
    const base = resolve(this.root);
    if (target !== base && !target.startsWith(`${base}/`)) {
      throw new Error(`CAS key escapes the store root: ${key}`);
    }
    return target;
  }

  async read(key: string): Promise<CasObject | null> {
    const path = this.pathFor(key);
    if (!existsSync(path)) { return null; }
    const body = readFileSync(path, 'utf8');
    return { body, etag: etagOf(body) };
  }

  async putIfMatch(key: string, body: string, expected: CasPrecondition): Promise<CasObject> {
    const current = await this.read(key);
    if (!matches(expected, current)) { throw new CasPreconditionError(key, expected, current?.etag ?? null); }
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, body);
    renameSync(temp, path);
    return { body, etag: etagOf(body) };
  }

  async deleteIfMatch(key: string, expected: CasPrecondition): Promise<void> {
    const current = await this.read(key);
    if (!matches(expected, current)) { throw new CasPreconditionError(key, expected, current?.etag ?? null); }
    rmSync(this.pathFor(key), { force: true });
  }

  /** Debug helper for local rehearsals; never used by delivery logic. */
  keys(): string[] {
    if (!existsSync(this.root)) { return []; }
    const out: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) { walk(join(dir, entry.name), `${prefix}${entry.name}/`); } else { out.push(`${prefix}${entry.name}`); }
      }
    };
    walk(this.root, '');
    return out.sort();
  }
}

/** Object keys for the two mutable documents. Base-relative per §3.1's migration rule. */
export function channelPointerKey(channel: string): string {
  return `channels/${channel}.json`;
}

export function supportPolicyKey(): string {
  return 'support/support-policy.json';
}

export interface CasWriteOutcome {
  key: string;
  etag: string;
  /** True when the store already held byte-identical content (§6A.5 idempotency). */
  reused: boolean;
  previousSha256: string | null;
  sha256: string;
}

/**
 * The one write primitive both mutable documents go through.
 *
 * `expectedPreviousSha256` is the *content* precondition from the approved
 * plan; `undefined` means the caller is not asserting one, which is only ever
 * legitimate for a first publication. The `reused` short-circuit is §6A.5's
 * idempotency rule applied to mutable documents: re-running a delivery step
 * whose write already landed must be a success, not a conflict, or a crash
 * between the write and its acknowledgement would be unrecoverable.
 */
export async function writeDocumentWithCas(input: {
  store: CasStore;
  key: string;
  body: string;
  sha256: string;
  expectedPreviousSha256?: string | null;
  /** Digest of whatever is currently stored, given the raw body. */
  digestOf: (body: string) => string;
}): Promise<CasWriteOutcome> {
  const current = await input.store.read(input.key);
  const currentSha256 = current ? input.digestOf(current.body) : null;

  if (currentSha256 === input.sha256) {
    return { key: input.key, etag: current!.etag, reused: true, previousSha256: currentSha256, sha256: input.sha256 };
  }

  if (input.expectedPreviousSha256 !== undefined && currentSha256 !== input.expectedPreviousSha256) {
    throw new ReleaseAdapterError(
      `refusing to overwrite ${input.key}: the approved plan expected `
      + `${input.expectedPreviousSha256 ?? '<absent>'} but the endpoint currently holds ${currentSha256 ?? '<absent>'}. `
      + 'This is drift, not a conflict to resolve here — the operation must be reconciled by a human.',
      { retryable: false, code: ReleaseControlDiagnosticCode.PointerPreconditionMismatch },
    );
  }

  const written = await input.store.putIfMatch(input.key, input.body, current?.etag ?? CAS_ABSENT);
  return { key: input.key, etag: written.etag, reused: false, previousSha256: currentSha256, sha256: input.sha256 };
}
