/**
 * The release version ledger (cutover plan §3, execution plan PR 4 item 3).
 *
 * One rule justifies this whole module: **a version that has ever been handed
 * out is never handed out again**, in any state, on any channel, even if the
 * release that asked for it was abandoned. Gaps in the sequence are the price,
 * and they are cheap; a reused version is not, because a canary is promoted to
 * stable by moving a pointer onto bytes that already exist — which is only
 * sound if a version identifies exactly one set of bytes forever.
 *
 * ## Ownership
 *
 * Per execution plan §3.2, the plugin computes a *proposal* and Workflow
 * performs the compare-and-set. Workflow does not exist yet (PR 5), so
 * `reserveVersion()` lives here — but deliberately behind a `ReleaseLedgerStore`
 * interface whose whole surface is `readTail`/`append` under a caller-supplied
 * mutual exclusion. That is precisely what a durable append-only file on `vm-1`
 * under a host-local exclusive lock implements, so PR 5 replaces the store, not
 * the algorithm.
 *
 * ## Why compare-and-set rather than a lock alone
 *
 * A lock makes two writers serial; it does not make a *stale proposal* safe.
 * The second writer's proposal was computed against a ledger tail that no
 * longer exists, so its version may already be taken. The CAS token is the tail
 * sequence: if it moved, the proposal is rejected and recomputed. This is why
 * `reserveVersion` returns a conflict instead of quietly allocating something
 * else — the caller's *bump decision* also has to be recomputed, not just the
 * number.
 */

import {
  ReleaseControlDiagnosticCode,
  ReleaseLedgerEntrySchema,
  isAllowedLedgerTransition,
  type ReleaseLedgerEntry,
  type ReleaseLedgerState,
  type ReleaseVersionProposal,
} from '@kb-labs/release-manager-contracts';

/**
 * Append-only ledger storage.
 *
 * Intentionally tiny. Everything the reservation algorithm needs is "what is
 * the whole history" and "append this entry only if the history has not grown
 * since I read it"; anything richer would leak an implementation into the
 * contract PR 5 has to honour.
 */
export interface ReleaseLedgerStore {
  /** Full history, oldest first. Callers treat it as immutable. */
  read(): Promise<readonly ReleaseLedgerEntry[]>;
  /**
   * Appends `entry` iff the current tail sequence equals `expectedTailSequence`
   * (`-1` for an empty ledger). Returns false on mismatch rather than throwing:
   * a lost race is an ordinary outcome, not an error.
   *
   * Implementations must make the read-compare-write step atomic with respect
   * to every other caller of the same ledger.
   */
  appendIfTail(expectedTailSequence: number, entry: ReleaseLedgerEntry): Promise<boolean>;
  /** Replaces an existing entry in place — used only for state transitions. */
  replace(entry: ReleaseLedgerEntry): Promise<void>;
}

export class ReleaseLedgerError extends Error {
  readonly code: ReleaseControlDiagnosticCode;

  constructor(code: ReleaseControlDiagnosticCode, message: string) {
    super(message);
    this.name = 'ReleaseLedgerError';
    this.code = code;
  }
}

export type ReserveVersionResult =
  | { ok: true; entry: ReleaseLedgerEntry }
  | { ok: false; code: ReleaseControlDiagnosticCode; message: string; tailSequence: number };

export interface ReserveVersionOptions {
  /** Fixed timestamp for deterministic tests; defaults to now. */
  now?: () => string;
  actor?: string;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function tailSequence(entries: readonly ReleaseLedgerEntry[]): number {
  return entries.length === 0 ? -1 : entries[entries.length - 1]!.sequence;
}

/**
 * Every version the ledger has ever allocated for a flow, in any state.
 *
 * State is deliberately ignored: `rejected` and `cancelled` versions are burned,
 * not free. This is the set the version policy must step past and the CAS must
 * refuse to intersect.
 */
export function allocatedVersions(entries: readonly ReleaseLedgerEntry[], flow: string): string[] {
  return entries.filter(entry => entry.flow === flow).map(entry => entry.version);
}

export function entriesForFlow(entries: readonly ReleaseLedgerEntry[], flow: string): ReleaseLedgerEntry[] {
  return entries.filter(entry => entry.flow === flow);
}

/**
 * Executes the compare-and-set reservation described by `proposal`.
 *
 * This is the function Workflow calls in PR 5. It is a pure function of the
 * proposal and the store, so moving the call site does not move the policy.
 */
export async function reserveVersion(
  store: ReleaseLedgerStore,
  proposal: ReleaseVersionProposal,
  options: ReserveVersionOptions = {},
): Promise<ReserveVersionResult> {
  const now = options.now ?? nowIso;
  const entries = await store.read();
  const tail = tailSequence(entries);

  // Precondition 1 — the ledger has not moved since the proposal was computed.
  // Checked before the version check so a losing racer is told *why* it lost:
  // "someone else appended", not "your number happens to be taken".
  if (proposal.preconditions.expectedTailSequence !== tail) {
    return {
      ok: false,
      code: ReleaseControlDiagnosticCode.ReservationConflict,
      message:
        `Ledger tail moved from ${proposal.preconditions.expectedTailSequence} to ${tail} ` +
        'while the version proposal was being prepared; recompute the proposal.',
      tailSequence: tail,
    };
  }

  // Precondition 2 — the number itself. Belt and braces with precondition 1:
  // a caller that reuses a proposal against a *different* store, or a proposal
  // built by a buggy policy, must still not be able to duplicate a version.
  const taken = new Set(allocatedVersions(entries, proposal.flow));
  if (taken.has(proposal.version)) {
    return {
      ok: false,
      code: ReleaseControlDiagnosticCode.VersionAlreadyAllocated,
      message: `Version ${proposal.version} was already allocated for flow ${proposal.flow} and can never be reused.`,
      tailSequence: tail,
    };
  }

  const at = now();
  const entry: ReleaseLedgerEntry = ReleaseLedgerEntrySchema.parse({
    schema: 'kb.release-ledger-entry/1',
    sequence: tail + 1,
    flow: proposal.flow,
    version: proposal.version,
    channel: proposal.channel,
    state: 'reserved' satisfies ReleaseLedgerState,
    // Release identity is a function of the flow and the allocated version, so
    // it can only be known here — after the CAS decided which version this is.
    releaseId: `${proposal.flow}-${proposal.version}`,
    candidateId: proposal.candidateId,
    reservedAt: at,
    updatedAt: at,
    transitions: [{ from: null, to: 'reserved', at, actor: options.actor ?? 'release-plugin' }],
    signature: null,
  });

  const appended = await store.appendIfTail(tail, entry);
  if (!appended) {
    return {
      ok: false,
      code: ReleaseControlDiagnosticCode.ReservationConflict,
      message: 'Another reservation won the compare-and-set; recompute the proposal.',
      tailSequence: tailSequence(await store.read()),
    };
  }

  return { ok: true, entry };
}

/**
 * Moves an existing allocation to a new state.
 *
 * The version is never rewritten — only the state is — because the entry *is*
 * the allocation. `rejected`/`cancelled` are terminal-and-occupied by design.
 */
export async function transitionLedgerEntry(
  store: ReleaseLedgerStore,
  flow: string,
  version: string,
  to: ReleaseLedgerState,
  options: ReserveVersionOptions & { reason?: string } = {},
): Promise<ReleaseLedgerEntry> {
  const now = options.now ?? nowIso;
  const entries = await store.read();
  const current = entries.find(entry => entry.flow === flow && entry.version === version);
  if (!current) {
    throw new ReleaseLedgerError(
      ReleaseControlDiagnosticCode.VersionNotMonotonic,
      `No ledger entry for ${flow}@${version}.`,
    );
  }
  if (!isAllowedLedgerTransition(current.state, to)) {
    throw new ReleaseLedgerError(
      ReleaseControlDiagnosticCode.ReservationConflict,
      `Ledger transition ${current.state} → ${to} is not allowed for ${flow}@${version}.`,
    );
  }

  const at = now();
  const next: ReleaseLedgerEntry = ReleaseLedgerEntrySchema.parse({
    ...current,
    state: to,
    updatedAt: at,
    transitions: [
      ...current.transitions,
      {
        from: current.state,
        to,
        at,
        actor: options.actor ?? 'release-plugin',
        ...(options.reason ? { reason: options.reason } : {}),
      },
    ],
  });
  await store.replace(next);
  return next;
}

/**
 * In-memory store.
 *
 * Node runs the reservation body on one thread, but `reserveVersion` awaits
 * between its read and its append, so two overlapping calls interleave exactly
 * as two processes would. That is what makes this a real test of the CAS rather
 * than a test of a lock that happens to be uncontended.
 */
export class InMemoryReleaseLedgerStore implements ReleaseLedgerStore {
  private entries: ReleaseLedgerEntry[] = [];

  constructor(initial: readonly ReleaseLedgerEntry[] = []) {
    this.entries = [...initial];
  }

  async read(): Promise<readonly ReleaseLedgerEntry[]> {
    return [...this.entries];
  }

  async appendIfTail(expectedTailSequence: number, entry: ReleaseLedgerEntry): Promise<boolean> {
    if (tailSequence(this.entries) !== expectedTailSequence) { return false; }
    if (this.entries.some(existing => existing.flow === entry.flow && existing.version === entry.version)) {
      return false;
    }
    this.entries.push(entry);
    return true;
  }

  async replace(entry: ReleaseLedgerEntry): Promise<void> {
    const index = this.entries.findIndex(e => e.flow === entry.flow && e.version === entry.version);
    if (index < 0) { throw new ReleaseLedgerError(ReleaseControlDiagnosticCode.ReservationConflict, 'entry vanished'); }
    this.entries[index] = entry;
  }
}
