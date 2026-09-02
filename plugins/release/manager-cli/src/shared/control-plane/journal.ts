/**
 * The stable-promotion compensation journal (cutover §3C Phase A step 6).
 *
 * "Persist promotion journal и полный compensation plan до первой mutation" is
 * not bookkeeping — it is the only thing that makes recovery possible at all.
 * Between the first external mutation and the last one there is no transaction:
 * if the process dies in that window, the *only* way to know what to undo is a
 * record written before the window opened. A journal written afterwards would
 * describe a world it can no longer observe.
 *
 * The journal is therefore written once, in full, before Phase B, and then only
 * has operation *statuses* updated as the saga proceeds. Statuses are rewritten
 * in place rather than appended: unlike the receipt, whose history is the point,
 * the journal answers exactly one question — "what still needs undoing" — and a
 * log would make that answer a fold rather than a read at the moment when the
 * process trying to read it is already in trouble.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import {
  StablePromotionJournalSchema,
  type StablePromotionJournal,
  type StablePromotionJournalOperation,
} from '@kb-labs/release-manager-contracts';

export interface JournalStore {
  write(journal: StablePromotionJournal): Promise<StablePromotionJournal>;
  read(promotionId: string): Promise<StablePromotionJournal | null>;
}

export function releaseJournalDir(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'journals');
}

export class FileJournalStore implements JournalStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private path(promotionId: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(promotionId)) {
      throw new Error(`promotion id ${promotionId} is not a safe file name`);
    }
    return join(this.dir, `${promotionId}.json`);
  }

  async write(journal: StablePromotionJournal): Promise<StablePromotionJournal> {
    const parsed = StablePromotionJournalSchema.parse(journal);
    const fd = openSync(this.path(parsed.promotionId), 'w');
    try {
      writeSync(fd, `${JSON.stringify(parsed, null, 2)}\n`);
      // Durable before return, for the same reason as the receipt store: a
      // journal the caller believes in but the disk does not is worse than none.
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return parsed;
  }

  async read(promotionId: string): Promise<StablePromotionJournal | null> {
    const path = this.path(promotionId);
    if (!existsSync(path)) { return null; }
    return StablePromotionJournalSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  }
}

export class InMemoryJournalStore implements JournalStore {
  private readonly journals = new Map<string, StablePromotionJournal>();

  async write(journal: StablePromotionJournal): Promise<StablePromotionJournal> {
    const parsed = StablePromotionJournalSchema.parse(journal);
    this.journals.set(parsed.promotionId, parsed);
    return parsed;
  }

  async read(promotionId: string): Promise<StablePromotionJournal | null> {
    return this.journals.get(promotionId) ?? null;
  }
}

export function setOperationStatus(
  journal: StablePromotionJournal,
  id: string,
  status: StablePromotionJournalOperation['status'],
): StablePromotionJournal {
  return {
    ...journal,
    operations: journal.operations.map(operation =>
      operation.id === id ? { ...operation, status } : operation),
  };
}

/** The single authoritative operation: §3C's one commit point. */
export function authoritativeOperation(journal: StablePromotionJournal): StablePromotionJournalOperation | undefined {
  return journal.operations.find(operation => operation.authoritative);
}
