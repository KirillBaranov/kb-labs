/**
 * Local append-only file implementation of `ReceiptStore` and `LeaseStore`.
 *
 * Same relationship to execution plan §3.2 as `ledger-file-store.ts` has for the
 * version ledger: the decided target is append-only files on `vm-1` written over
 * the existing deploy SSH channel, and this is that shape with the filesystem
 * standing in for the transport. Both semantics §3.2 makes contractual are
 * implemented here rather than assumed:
 *
 * - **fsync before return** — `append` does not resolve until the event is on
 *   disk, so a crash can lose an *unacknowledged* call but never an
 *   acknowledged one.
 * - **one host-local exclusive lock** — receipts, the ledger and the stable
 *   lease each serialise through an `O_EXCL` lock file, so two concurrent
 *   workflow runs cannot interleave events into one receipt.
 *
 * One file per receipt rather than one shared log: a receipt is the unit of
 * concurrency, and a shared log would make two unrelated releases contend for
 * the same lock for no benefit.
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  ReleaseControlDiagnosticCode,
  type ReleaseReceipt,
  type ReleaseReceiptState,
} from '@kb-labs/release-manager-contracts';

import {
  foldReceiptEvents,
  ReceiptEventSchema,
  ReleaseReceiptError,
  type ReceiptEvent,
  type ReceiptStore,
} from './receipt.js';
import type { Lease, LeaseStore } from './lease.js';
import { LeaseRecordSchema, ReleaseLeaseError } from './lease.js';

export function releaseReceiptDir(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'receipts');
}

export function releaseLeaseDir(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'leases');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

export interface FileStoreOptions {
  lockTimeoutMs?: number;
  staleLockMs?: number;
}

/**
 * `O_EXCL` file lock, shared by both stores in this module.
 *
 * Atomic on every filesystem we run on. It is not a distributed lock and does
 * not pretend to be — correctness under a broken or bypassed lock comes from
 * the fold rejecting an illegal transition and from the lease record's own
 * holder check, not from mutual exclusion alone.
 */
async function withLock<T>(lockPath: string, options: FileStoreOptions, fn: () => T): Promise<T> {
  const timeout = options.lockTimeoutMs ?? 10_000;
  const stale = options.staleLockMs ?? 60_000;
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      break;
    } catch {
      let broke = false;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > stale) {
          rmSync(lockPath, { force: true });
          broke = true;
        }
      } catch { /* the lock vanished under us — retry, do not break */ }
      if (broke) { continue; }
      if (Date.now() > deadline) {
        throw new ReleaseReceiptError(
          ReleaseControlDiagnosticCode.ReceiptConflict,
          `timed out waiting for the release control-plane lock at ${lockPath}`,
        );
      }
      await sleep(15);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lockPath, { force: true });
  }
}

export class FileReceiptStore implements ReceiptStore {
  private readonly dir: string;
  private readonly options: FileStoreOptions;

  constructor(dir: string, options: FileStoreOptions = {}) {
    this.dir = dir;
    this.options = options;
    mkdirSync(dir, { recursive: true });
  }

  private logPath(receiptId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(receiptId)) {
      throw new ReleaseReceiptError(
        ReleaseControlDiagnosticCode.ReceiptConflict,
        `receipt id ${receiptId} is not a safe file name`,
      );
    }
    return join(this.dir, `${receiptId}.jsonl`);
  }

  private readEvents(receiptId: string): ReceiptEvent[] | null {
    const path = this.logPath(receiptId);
    if (!existsSync(path)) { return null; }
    const raw = readFileSync(path, 'utf8');
    const lines = raw.split('\n');
    const events: ReceiptEvent[] = [];
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // A torn *final* line is the one corruption an append-only log can
        // suffer honestly: the writer died mid-write, and that event was never
        // acknowledged. Anything earlier means the file was edited, which is
        // not recoverable and must not be guessed at.
        if (index === lines.length - 1) { continue; }
        throw new ReleaseReceiptError(
          ReleaseControlDiagnosticCode.ReceiptConflict,
          `receipt log ${path} is corrupt at line ${index + 1}`,
        );
      }
      events.push(ReceiptEventSchema.parse(parsed));
    }
    return events;
  }

  private appendLine(receiptId: string, event: ReceiptEvent): void {
    const fd = openSync(this.logPath(receiptId), 'a');
    try {
      writeSync(fd, `${JSON.stringify(event)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async create(event: Extract<ReceiptEvent, { kind: 'created' }>): Promise<ReleaseReceipt> {
    const parsed = ReceiptEventSchema.parse(event) as Extract<ReceiptEvent, { kind: 'created' }>;
    return withLock(`${this.logPath(parsed.receiptId)}.lock`, this.options, () => {
      if (existsSync(this.logPath(parsed.receiptId))) {
        throw new ReleaseReceiptError(
          ReleaseControlDiagnosticCode.ReceiptConflict,
          `receipt ${parsed.receiptId} already exists`,
        );
      }
      const receipt = foldReceiptEvents([parsed]);
      this.appendLine(parsed.receiptId, parsed);
      return receipt;
    });
  }

  async append(receiptId: string, event: ReceiptEvent): Promise<ReleaseReceipt> {
    const parsed = ReceiptEventSchema.parse(event);
    return withLock(`${this.logPath(receiptId)}.lock`, this.options, () => {
      const events = this.readEvents(receiptId);
      if (!events) {
        throw new ReleaseReceiptError(
          ReleaseControlDiagnosticCode.ReceiptNotFound,
          `no receipt ${receiptId} in ${this.dir}`,
        );
      }
      // Validate against the folded result before writing: an event that makes
      // the log unreadable must never reach the disk.
      const next = foldReceiptEvents([...events, parsed]);
      this.appendLine(receiptId, parsed);
      return next;
    });
  }

  async read(receiptId: string): Promise<ReleaseReceipt | null> {
    const events = this.readEvents(receiptId);
    return events ? foldReceiptEvents(events) : null;
  }

  async list(): Promise<readonly ReleaseReceipt[]> {
    if (!existsSync(this.dir)) { return []; }
    const receipts: ReleaseReceipt[] = [];
    for (const entry of readdirSync(this.dir).sort()) {
      if (!entry.endsWith('.jsonl')) { continue; }
      const events = this.readEvents(entry.slice(0, -'.jsonl'.length));
      if (events && events.length > 0) { receipts.push(foldReceiptEvents(events)); }
    }
    return receipts;
  }

  async listByState(state: ReleaseReceiptState): Promise<readonly ReleaseReceipt[]> {
    return (await this.list()).filter(receipt => receipt.state === state);
  }
}

/**
 * File-backed single global lease.
 *
 * A sibling of the receipt store rather than part of it, because the lease is
 * not per-receipt: cutover §3C Phase A demands that *one* stable promotion runs
 * at a time across all receipts. It uses the same lock primitive, so acquiring
 * a lease and appending a receipt event serialise against each other on the
 * same host.
 */
export class FileLeaseStore implements LeaseStore {
  private readonly dir: string;
  private readonly options: FileStoreOptions;
  private readonly now: () => number;

  constructor(dir: string, options: FileStoreOptions & { now?: () => number } = {}) {
    this.dir = dir;
    this.options = options;
    this.now = options.now ?? Date.now;
    mkdirSync(dir, { recursive: true });
  }

  private path(key: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new ReleaseLeaseError(ReleaseControlDiagnosticCode.StableLeaseHeld, `lease key ${key} is not a safe file name`);
    }
    return join(this.dir, `${key}.json`);
  }

  private readRecord(key: string): Lease | null {
    const path = this.path(key);
    if (!existsSync(path)) { return null; }
    return LeaseRecordSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  }

  private write(key: string, lease: Lease): void {
    const fd = openSync(this.path(key), 'w');
    try {
      writeSync(fd, `${JSON.stringify(lease, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  async acquire(lease: Lease): Promise<Lease> {
    return withLock(`${this.path(lease.key)}.lock`, this.options, () => {
      const existing = this.readRecord(lease.key);
      if (existing && Date.parse(existing.expiresAt) > this.now()) {
        if (existing.holder === lease.holder) {
          // Re-acquiring one's own live lease is a resume, not a conflict —
          // otherwise a crashed-and-restarted promotion could never continue.
          return existing;
        }
        throw new ReleaseLeaseError(
          ReleaseControlDiagnosticCode.StableLeaseHeld,
          `lease ${lease.key} is held by ${existing.holder} until ${existing.expiresAt}`,
        );
      }
      this.write(lease.key, lease);
      return lease;
    });
  }

  async read(key: string): Promise<Lease | null> {
    return this.readRecord(key);
  }

  async release(key: string, holder: string): Promise<void> {
    await withLock(`${this.path(key)}.lock`, this.options, () => {
      const existing = this.readRecord(key);
      if (!existing) { return; }
      if (existing.holder !== holder) {
        throw new ReleaseLeaseError(
          ReleaseControlDiagnosticCode.StableLeaseHeld,
          `lease ${key} is held by ${existing.holder}, not ${holder}`,
        );
      }
      rmSync(this.path(key), { force: true });
    });
  }
}
