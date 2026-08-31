/**
 * Break-glass exceptions (cutover plan §6A.3, decision S0.3e).
 *
 * This replaces `--skip-checks`. The difference is not cosmetic:
 *
 * - a flag is anonymous, unbounded in time, unscoped, and leaves no artifact;
 * - an exception names the operator, states a reason, expires, waives *specific
 *   check ids*, and is a document the receipt can carry.
 *
 * And it is not free: creating one irreversibly sets `stablePromotionForbidden`
 * on the candidate. That is the whole design — the escape hatch exists so a
 * canary can ship despite a broken gate, and the cost is that those exact bytes
 * can never become stable. A release that must reach stable has to fix the
 * check, not waive it.
 *
 * There is deliberately **no second approval** (decision S0.3e): the
 * irreversible loss of stable eligibility is the control, and adding ceremony
 * on top of it would only push operators toward working around the mechanism.
 *
 * CI never receives an override flag. The exception is consumed by the plugin's
 * own check evaluation and recorded in the receipt by Workflow (PR 5); nothing
 * about it is expressible in a CI input.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ReleaseExceptionSchema,
  type ReleaseException,
} from '@kb-labs/release-manager-contracts';

import { RELEASE_CHECK_GROUPS } from './checks.js';

export const DEFAULT_EXCEPTION_TTL_HOURS = 24;
/** A waiver that outlives the release it was written for stops being a waiver. */
export const MAX_EXCEPTION_TTL_HOURS = 24 * 7;

export function exceptionsDir(repoRoot: string, candidateId: string): string {
  return join(repoRoot, '.kb', 'release', 'exceptions', candidateId);
}

export interface CreateExceptionInput {
  repoRoot: string;
  flow: string;
  candidateId: string;
  checkIds: readonly string[];
  reason: string;
  operator: string;
  ttlHours?: number;
  now?: () => Date;
}

export class ReleaseExceptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseExceptionError';
  }
}

/**
 * Validates and writes one exception.
 *
 * Unknown check ids are rejected rather than accepted-and-ignored: an operator
 * who typos an id would otherwise get an exception that waives nothing while
 * believing the gate is open — and would still pay the stable-promotion cost.
 */
export function createReleaseException(input: CreateExceptionInput): { exception: ReleaseException; path: string } {
  const now = (input.now ?? (() => new Date()))();
  const ttlHours = input.ttlHours ?? DEFAULT_EXCEPTION_TTL_HOURS;

  if (input.checkIds.length === 0) {
    throw new ReleaseExceptionError(
      'An exception must name the checks it waives. A blanket waiver is exactly the --skip-checks flag this replaces.',
    );
  }
  const known = new Set(RELEASE_CHECK_GROUPS.map(check => check.id));
  const unknown = input.checkIds.filter(id => !known.has(id));
  if (unknown.length > 0) {
    throw new ReleaseExceptionError(
      `Unknown check id(s): ${unknown.join(', ')}. Known ids: ${[...known].join(', ')}.`,
    );
  }
  if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > MAX_EXCEPTION_TTL_HOURS) {
    throw new ReleaseExceptionError(
      `TTL must be between 1 and ${MAX_EXCEPTION_TTL_HOURS} hours; got ${ttlHours}.`,
    );
  }
  if (input.reason.trim().length < 8) {
    throw new ReleaseExceptionError('An exception reason must explain the trade-off, not be a placeholder.');
  }

  const iso = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const exception = ReleaseExceptionSchema.parse({
    schema: 'kb.release-exception/1',
    exceptionId: `exception-${randomUUID()}`,
    flow: input.flow,
    candidateId: input.candidateId,
    checkIds: [...input.checkIds],
    reason: input.reason.trim(),
    operator: input.operator,
    createdAt: iso(now),
    expiresAt: iso(new Date(now.getTime() + ttlHours * 3600_000)),
    // Literal `true` in the schema — there is no shape of this document that
    // permits stable promotion, so no code path can accidentally produce one.
    stablePromotionForbidden: true,
    signature: null,
  });

  const dir = exceptionsDir(input.repoRoot, input.candidateId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${exception.exceptionId}.json`);
  writeFileSync(path, `${JSON.stringify(exception, null, 2)}\n`);
  return { exception, path };
}

export function readExceptions(repoRoot: string, candidateId: string): ReleaseException[] {
  const dir = exceptionsDir(repoRoot, candidateId);
  let names: string[];
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  return names.map(name => ReleaseExceptionSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
}

/**
 * Whether any exception at all was ever written for this candidate.
 *
 * Deliberately ignores expiry. The stable-promotion ban is a property of the
 * candidate's history, not of a currently-valid waiver: letting an exception
 * expire back into stable eligibility would make the irreversibility a lie.
 * PR 5 stamps this onto the receipt; until receipts exist, the exception files
 * themselves carry it.
 */
export function isStablePromotionForbidden(repoRoot: string, candidateId: string): boolean {
  return readExceptions(repoRoot, candidateId).length > 0;
}
