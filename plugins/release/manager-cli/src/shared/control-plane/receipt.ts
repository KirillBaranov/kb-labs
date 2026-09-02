/**
 * The release receipt: Workflow's single source of operational truth
 * (cutover plan §4.3 and §6A.4, execution plan PR 5 item 1).
 *
 * ## Why an event log rather than a mutable document
 *
 * `ReleaseReceipt` — the document defined in the contracts package — is what
 * crosses boundaries: CI reads it, an operator reads it, `kb-create` never sees
 * it. But it is a *fold*, not the storage format. What is actually stored is an
 * append-only sequence of events, because the two questions a release post-mortem
 * asks are "what state is this in" and "how did it get here, who decided, when",
 * and only the second one is destroyed by in-place mutation.
 *
 * Appending also removes the read-modify-write window that a mutable document
 * has: two concurrent workflow runs cannot interleave into a receipt that
 * records neither run's history.
 *
 * ## Why the transition check lives in the fold
 *
 * `isAllowedReceiptTransition` (PR 1) is the §6A.1.5 table. Checking it in the
 * orchestrator would leave the store able to accept a state change no table
 * entry permits — which is exactly the class of bug the table exists to prevent.
 * So the check runs in `foldReceiptEvents`, which every implementation of
 * `ReceiptStore` must use, and an illegal transition is *rejected*: never
 * coerced into the nearest legal state, never silently dropped.
 *
 * ## Ownership
 *
 * Execution plan §3.2: Workflow is the only writer. CI is handed a receipt id
 * and a read locator and nothing else. Nothing in this module takes a CI-shaped
 * input, and the adapter interfaces in `adapters.ts` deliberately cannot reach a
 * store — that constraint is enforced by them not being given one.
 */

import {
  ReleaseReceiptSchema,
  ReleaseControlDiagnosticCode,
  isAllowedReceiptTransition,
  type ReleaseReceipt,
  type ReleaseReceiptState,
} from '@kb-labs/release-manager-contracts';
import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmpty = z.string().min(1);
const rfc3339 = z.string().datetime({ offset: true });

const EvidenceReferenceSchema = z.object({
  id: nonEmpty,
  kind: nonEmpty,
  sha256: sha256.optional(),
  uri: z.string().url().optional(),
}).strict();

export type ReceiptEvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

/**
 * Fields a receipt learns as it progresses.
 *
 * They are separated from `transition` because they are not decisions: binding
 * a `bundleSha256` is recording a fact about bytes that already exist. Keeping
 * them apart means a state change never smuggles in a changed digest.
 */
const ReceiptBindingSchema = z.object({
  candidateId: nonEmpty.optional(),
  bundleSha256: sha256.optional(),
  indexSha256: sha256.optional(),
  releaseCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  treeSha256: sha256.optional(),
}).strict();

export const ReceiptEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('created'),
    at: rfc3339,
    actor: nonEmpty,
    receiptId: nonEmpty,
    releaseId: nonEmpty,
    state: z.enum(['planned', 'promotion-planned']),
    binding: ReceiptBindingSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('transition'),
    at: rfc3339,
    actor: nonEmpty,
    to: nonEmpty,
    reason: z.string().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal('evidence'),
    at: rfc3339,
    actor: nonEmpty,
    evidence: EvidenceReferenceSchema,
  }).strict(),
  z.object({
    kind: z.literal('binding'),
    at: rfc3339,
    actor: nonEmpty,
    binding: ReceiptBindingSchema,
  }).strict(),
]);
export type ReceiptEvent = z.infer<typeof ReceiptEventSchema>;

export class ReleaseReceiptError extends Error {
  readonly code: ReleaseControlDiagnosticCode;

  constructor(code: ReleaseControlDiagnosticCode, message: string) {
    super(message);
    this.name = 'ReleaseReceiptError';
    this.code = code;
  }
}

/**
 * Folds an event log into the contract document, enforcing the transition table.
 *
 * Deliberately total and pure: given the same log it returns the same receipt,
 * on any host, which is what makes a receipt read over SSH and a receipt read
 * from a test fixture the same object.
 */
export function foldReceiptEvents(events: readonly ReceiptEvent[]): ReleaseReceipt {
  const [head, ...rest] = events;
  if (!head || head.kind !== 'created') {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ReceiptConflict,
      'a receipt log must begin with exactly one `created` event',
    );
  }

  let state: ReleaseReceiptState = head.state;
  const transitions: ReleaseReceipt['transitions'] = [
    { from: null, to: head.state, at: head.at, actor: head.actor },
  ];
  const evidence: ReceiptEvidenceReference[] = [];
  let binding = { ...(head.binding ?? {}) };

  for (const event of rest) {
    switch (event.kind) {
      case 'created':
        throw new ReleaseReceiptError(
          ReleaseControlDiagnosticCode.ReceiptConflict,
          'a receipt log carries exactly one `created` event',
        );
      case 'transition': {
        const to = event.to as ReleaseReceiptState;
        if (!isAllowedReceiptTransition(state, to)) {
          throw new ReleaseReceiptError(
            ReleaseControlDiagnosticCode.IllegalReceiptTransition,
            `receipt ${head.receiptId}: transition ${state} → ${to} is not in the release transition table`,
          );
        }
        transitions.push({
          from: state,
          to,
          at: event.at,
          actor: event.actor,
          ...(event.reason ? { reason: event.reason } : {}),
        });
        state = to;
        break;
      }
      case 'evidence':
        // Duplicate evidence is idempotent rather than an error: a replayed
        // adapter call is a legitimate resume, and re-recording the same
        // observation must not change the receipt.
        if (!evidence.some(existing => existing.id === event.evidence.id)) {
          evidence.push(event.evidence);
        }
        break;
      case 'binding': {
        for (const [key, value] of Object.entries(event.binding)) {
          const current = (binding as Record<string, unknown>)[key];
          if (current !== undefined && current !== value) {
            // Rebinding a digest would let a later event quietly redefine what
            // an earlier approval covered.
            throw new ReleaseReceiptError(
              ReleaseControlDiagnosticCode.ResumeIdentityMismatch,
              `receipt ${head.receiptId}: ${key} is already bound to ${String(current)} and cannot become ${String(value)}`,
            );
          }
        }
        binding = { ...binding, ...event.binding };
        break;
      }
    }
  }

  return ReleaseReceiptSchema.parse({
    schema: 'kb.release-receipt/1',
    receiptId: head.receiptId,
    releaseId: head.releaseId,
    ...binding,
    state,
    transitions,
    evidence,
    signature: null,
  });
}

/**
 * Durable, append-only receipt storage.
 *
 * Kept as narrow as `ReleaseLedgerStore` (PR 4) and for the same reason: the
 * real target is append-only files on `vm-1` reached over the deploy SSH
 * channel (execution plan §3.2), and every method here is one round trip that
 * an SSH implementation can honour. Two semantics are contractual, not
 * incidental:
 *
 * - **Durable before return.** `append` must not resolve until the bytes are
 *   synced. A caller told "the approval is recorded" must not be able to
 *   discover after a crash that it is not.
 * - **Single host-local exclusive lock.** Concurrent workflow runs serialise
 *   through one lock, so a receipt can never interleave two runs' events.
 */
export interface ReceiptStore {
  create(event: Extract<ReceiptEvent, { kind: 'created' }>): Promise<ReleaseReceipt>;
  append(receiptId: string, event: ReceiptEvent): Promise<ReleaseReceipt>;
  read(receiptId: string): Promise<ReleaseReceipt | null>;
  list(): Promise<readonly ReleaseReceipt[]>;
  listByState(state: ReleaseReceiptState): Promise<readonly ReleaseReceipt[]>;
}

/** Reads a receipt or throws the typed not-found diagnostic. */
export async function requireReceipt(store: ReceiptStore, receiptId: string): Promise<ReleaseReceipt> {
  const receipt = await store.read(receiptId);
  if (!receipt) {
    throw new ReleaseReceiptError(
      ReleaseControlDiagnosticCode.ReceiptNotFound,
      `no receipt ${receiptId} in the receipt store`,
    );
  }
  return receipt;
}

export interface TransitionOptions {
  actor: string;
  reason?: string;
  at?: string;
  /** Facts learned by making this transition; bound in the same append. */
  binding?: z.infer<typeof ReceiptBindingSchema>;
  evidence?: ReceiptEvidenceReference;
}

export function receiptNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Records one state change.
 *
 * Bindings and evidence are appended *before* the transition so that a crash
 * between the two leaves a receipt that knows the digest but has not yet
 * claimed the state — the safe direction. The reverse order would produce a
 * receipt claiming `bundled` with no `bundleSha256` to approve.
 */
export async function transitionReceipt(
  store: ReceiptStore,
  receiptId: string,
  to: ReleaseReceiptState,
  options: TransitionOptions,
): Promise<ReleaseReceipt> {
  const at = options.at ?? receiptNow();
  if (options.binding) {
    await store.append(receiptId, { kind: 'binding', at, actor: options.actor, binding: options.binding });
  }
  if (options.evidence) {
    await store.append(receiptId, { kind: 'evidence', at, actor: options.actor, evidence: options.evidence });
  }
  return store.append(receiptId, {
    kind: 'transition',
    at,
    actor: options.actor,
    to,
    ...(options.reason ? { reason: options.reason } : {}),
  });
}

/** Records an observation without changing state. */
export async function recordReceiptEvidence(
  store: ReceiptStore,
  receiptId: string,
  evidence: ReceiptEvidenceReference,
  options: { actor: string; at?: string },
): Promise<ReleaseReceipt> {
  return store.append(receiptId, {
    kind: 'evidence',
    at: options.at ?? receiptNow(),
    actor: options.actor,
    evidence,
  });
}

/**
 * In-memory store.
 *
 * Used by the saga tests and by `--dry-run`. It is a real implementation of the
 * interface, not a stub: it folds through the same `foldReceiptEvents`, so an
 * illegal transition fails identically here and on disk.
 */
export class InMemoryReceiptStore implements ReceiptStore {
  private readonly logs = new Map<string, ReceiptEvent[]>();

  async create(event: Extract<ReceiptEvent, { kind: 'created' }>): Promise<ReleaseReceipt> {
    const parsed = ReceiptEventSchema.parse(event) as Extract<ReceiptEvent, { kind: 'created' }>;
    if (this.logs.has(parsed.receiptId)) {
      throw new ReleaseReceiptError(
        ReleaseControlDiagnosticCode.ReceiptConflict,
        `receipt ${parsed.receiptId} already exists`,
      );
    }
    this.logs.set(parsed.receiptId, [parsed]);
    return foldReceiptEvents([parsed]);
  }

  async append(receiptId: string, event: ReceiptEvent): Promise<ReleaseReceipt> {
    const log = this.logs.get(receiptId);
    if (!log) {
      throw new ReleaseReceiptError(
        ReleaseControlDiagnosticCode.ReceiptNotFound,
        `no receipt ${receiptId} in the receipt store`,
      );
    }
    const parsed = ReceiptEventSchema.parse(event);
    // Fold the candidate log first: an event that would produce an invalid
    // receipt must not be persisted, or the store becomes unreadable.
    const next = foldReceiptEvents([...log, parsed]);
    log.push(parsed);
    return next;
  }

  async read(receiptId: string): Promise<ReleaseReceipt | null> {
    const log = this.logs.get(receiptId);
    return log ? foldReceiptEvents(log) : null;
  }

  async list(): Promise<readonly ReleaseReceipt[]> {
    return [...this.logs.values()].map(log => foldReceiptEvents(log));
  }

  async listByState(state: ReleaseReceiptState): Promise<readonly ReleaseReceipt[]> {
    return (await this.list()).filter(receipt => receipt.state === state);
  }

  /** Test seam: the raw log, to assert that nothing was ever rewritten. */
  eventsFor(receiptId: string): readonly ReceiptEvent[] {
    return this.logs.get(receiptId) ?? [];
  }
}
