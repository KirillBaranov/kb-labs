/**
 * Local append-only file implementation of `ReleaseLedgerStore`.
 *
 * This is the shape execution plan §3.2 describes for the durable store on
 * `vm-1`: an append-only log guarded by a host-local exclusive lock, fsync'd
 * before the caller is answered. Only the transport differs — PR 5 swaps the
 * filesystem for the same operations over SSH and keeps the semantics.
 *
 * JSON Lines rather than a JSON array: appending a line is a single write with
 * no read-modify-write of the whole document, and a torn final line is
 * detectable and discardable instead of corrupting the entire history.
 *
 * The lock is a `wx` (O_EXCL) directory-adjacent file, which is atomic on every
 * filesystem we run on, including the NFS-free case we actually have. It is
 * *not* a distributed lock and does not pretend to be — the compare-and-set in
 * `reserveVersion` is what keeps correctness when the lock is bypassed or a
 * stale lock is broken.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  ReleaseControlDiagnosticCode,
  ReleaseLedgerEntrySchema,
  type ReleaseLedgerEntry,
} from '@kb-labs/release-manager-contracts';

import { ReleaseLedgerError, type ReleaseLedgerStore } from './ledger.js';

export const LEDGER_FILE = 'ledger.jsonl';

export function releaseLedgerPath(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'ledger', LEDGER_FILE);
}

/** Sleep without pulling in a timer helper; used only by lock acquisition. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms); });
}

export interface FileLedgerStoreOptions {
  /** How long to wait for the lock before giving up. */
  lockTimeoutMs?: number;
  /** A lock older than this is assumed to be from a crashed process and broken. */
  staleLockMs?: number;
}

export class FileReleaseLedgerStore implements ReleaseLedgerStore {
  private readonly path: string;
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;

  constructor(path: string, options: FileLedgerStoreOptions = {}) {
    this.path = path;
    this.lockPath = `${path}.lock`;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 10_000;
    this.staleLockMs = options.staleLockMs ?? 60_000;
    mkdirSync(dirname(path), { recursive: true });
  }

  async read(): Promise<readonly ReleaseLedgerEntry[]> {
    return this.readSync();
  }

  private readSync(): ReleaseLedgerEntry[] {
    if (!existsSync(this.path)) { return []; }
    const raw = readFileSync(this.path, 'utf8');
    const entries: ReleaseLedgerEntry[] = [];
    for (const [index, line] of raw.split('\n').entries()) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // A torn final line is the one recoverable corruption an append-only
        // log can suffer: the writer died mid-write. Anything earlier means the
        // file was edited, which is not recoverable and must not be guessed at.
        if (index === raw.split('\n').length - 1) { continue; }
        throw new ReleaseLedgerError(
          ReleaseControlDiagnosticCode.ReservationConflict,
          `Release ledger ${this.path} is corrupt at line ${index + 1}.`,
        );
      }
      entries.push(ReleaseLedgerEntrySchema.parse(parsed));
    }
    return entries;
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      try {
        const fd = openSync(this.lockPath, 'wx');
        writeSync(fd, `${process.pid}\n`);
        closeSync(fd);
        break;
      } catch {
        if (this.breakStaleLock()) { continue; }
        if (Date.now() > deadline) {
          throw new ReleaseLedgerError(
            ReleaseControlDiagnosticCode.ReservationConflict,
            `Timed out waiting for the release ledger lock at ${this.lockPath}.`,
          );
        }
        await sleep(15);
      }
    }
    try {
      return fn();
    } finally {
      rmSync(this.lockPath, { force: true });
    }
  }

  private breakStaleLock(): boolean {
    try {
      const { mtimeMs } = statSync(this.lockPath);
      if (Date.now() - mtimeMs > this.staleLockMs) {
        rmSync(this.lockPath, { force: true });
        return true;
      }
    } catch { /* the lock disappeared underneath us — that is a retry, not a break */ }
    return false;
  }

  async appendIfTail(expectedTailSequence: number, entry: ReleaseLedgerEntry): Promise<boolean> {
    return this.withLock(() => {
      const entries = this.readSync();
      const tail = entries.length === 0 ? -1 : entries[entries.length - 1]!.sequence;
      if (tail !== expectedTailSequence) { return false; }
      if (entries.some(existing => existing.flow === entry.flow && existing.version === entry.version)) {
        return false;
      }
      const fd = openSync(this.path, 'a');
      try {
        writeSync(fd, `${JSON.stringify(entry)}\n`);
        // Durable before the caller is told it won: a reservation the caller
        // believes in but the disk does not is precisely a duplicate version
        // after a crash.
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return true;
    });
  }

  /**
   * Rewrites the log with one entry replaced.
   *
   * A state transition is not an append in the "new allocation" sense, and
   * treating it as one would let the tail sequence advance without a version
   * being allocated — which would make `expectedTailSequence` mean two
   * different things. The rewrite goes through a temp file + rename so a crash
   * cannot leave a partial history behind.
   */
  async replace(entry: ReleaseLedgerEntry): Promise<void> {
    await this.withLock(() => {
      const entries = this.readSync();
      const index = entries.findIndex(e => e.flow === entry.flow && e.version === entry.version);
      if (index < 0) {
        throw new ReleaseLedgerError(
          ReleaseControlDiagnosticCode.ReservationConflict,
          `No ledger entry for ${entry.flow}@${entry.version} to replace.`,
        );
      }
      entries[index] = entry;
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
      renameSync(tmp, this.path);
    });
  }
}
