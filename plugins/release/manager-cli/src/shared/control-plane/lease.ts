/**
 * The single global stable-promotion lease (cutover plan §3C Phase A step 1).
 *
 * Two independent things must be true before a stable promotion may start, and
 * they fail for different reasons, so they are two different checks:
 *
 * 1. **No other promotion is running.** That is the lease.
 * 2. **No previous promotion left the world in an unknown state.** That is the
 *    `rollback-needs-attention` block from §3C's compensation order: "Неуспешная
 *    компенсация … блокирует все последующие stable operations". A lease would
 *    not catch this, because the failed operation has stopped running.
 *
 * The lease is a record, not a mutex object, precisely so the second check can
 * see it: an operator asking "why can I not promote" gets a holder, a reason
 * and an expiry rather than a hung command.
 */

import {
  ReleaseControlDiagnosticCode,
  type ReleaseReceipt,
} from '@kb-labs/release-manager-contracts';
import { z } from 'zod';

import type { ReceiptStore } from './receipt.js';

export const STABLE_PROMOTION_LEASE_KEY = 'stable-promotion';

export const LeaseRecordSchema = z.object({
  schema: z.literal('kb.release-lease/1'),
  key: z.string().min(1),
  /** The receipt id, so a crashed run can reclaim its own lease on resume. */
  holder: z.string().min(1),
  actor: z.string().min(1),
  acquiredAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  reason: z.string().min(1).optional(),
}).strict();
export type Lease = z.infer<typeof LeaseRecordSchema>;

export class ReleaseLeaseError extends Error {
  readonly code: ReleaseControlDiagnosticCode;

  constructor(code: ReleaseControlDiagnosticCode, message: string) {
    super(message);
    this.name = 'ReleaseLeaseError';
    this.code = code;
  }
}

/**
 * Exclusive lease storage.
 *
 * Deliberately three methods. Anything richer (renew, list, steal) would invite
 * a caller to work around a held lease, and the one thing this primitive exists
 * to guarantee is that nobody does.
 */
export interface LeaseStore {
  /** Takes the lease, or throws `StableLeaseHeld`. Re-acquiring one's own live lease succeeds. */
  acquire(lease: Lease): Promise<Lease>;
  read(key: string): Promise<Lease | null>;
  /** Releases only if `holder` matches; a foreign holder is an error, not a no-op. */
  release(key: string, holder: string): Promise<void>;
}

export class InMemoryLeaseStore implements LeaseStore {
  private readonly leases = new Map<string, Lease>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async acquire(lease: Lease): Promise<Lease> {
    const parsed = LeaseRecordSchema.parse(lease);
    const existing = this.leases.get(parsed.key);
    if (existing && Date.parse(existing.expiresAt) > this.now()) {
      if (existing.holder === parsed.holder) { return existing; }
      throw new ReleaseLeaseError(
        ReleaseControlDiagnosticCode.StableLeaseHeld,
        `lease ${parsed.key} is held by ${existing.holder} until ${existing.expiresAt}`,
      );
    }
    this.leases.set(parsed.key, parsed);
    return parsed;
  }

  async read(key: string): Promise<Lease | null> {
    return this.leases.get(key) ?? null;
  }

  async release(key: string, holder: string): Promise<void> {
    const existing = this.leases.get(key);
    if (!existing) { return; }
    if (existing.holder !== holder) {
      throw new ReleaseLeaseError(
        ReleaseControlDiagnosticCode.StableLeaseHeld,
        `lease ${key} is held by ${existing.holder}, not ${holder}`,
      );
    }
    this.leases.delete(key);
  }
}

/**
 * The §3C block on new stable work after a failed compensation.
 *
 * Returns the offending receipts rather than a boolean: an operator who is
 * blocked needs to know *which* promotion left drift behind, and a message
 * saying only "blocked" would send them looking through the whole store.
 */
export async function blockingStableReceipts(store: ReceiptStore): Promise<readonly ReleaseReceipt[]> {
  return store.listByState('rollback-needs-attention');
}

export async function assertStablePromotionAllowed(store: ReceiptStore): Promise<void> {
  const blocking = await blockingStableReceipts(store);
  if (blocking.length > 0) {
    throw new ReleaseLeaseError(
      ReleaseControlDiagnosticCode.StablePromotionBlocked,
      'stable promotions are blocked until compensation drift is reconciled: '
      + blocking.map(receipt => receipt.receiptId).join(', '),
    );
  }
}

export function buildLease(input: {
  key?: string;
  holder: string;
  actor: string;
  at: string;
  ttlSeconds: number;
  reason?: string;
}): Lease {
  return LeaseRecordSchema.parse({
    schema: 'kb.release-lease/1',
    key: input.key ?? STABLE_PROMOTION_LEASE_KEY,
    holder: input.holder,
    actor: input.actor,
    acquiredAt: input.at,
    expiresAt: new Date(Date.parse(input.at) + input.ttlSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ...(input.reason ? { reason: input.reason } : {}),
  });
}
