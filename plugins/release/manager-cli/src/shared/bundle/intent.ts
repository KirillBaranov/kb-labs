/**
 * Loading and binding of `intent.json`.
 *
 * `stage`, `package`, `seal` and `commit` all take the *same* already-formed
 * intent as their only release decision — none of them computes version policy
 * or package membership (that is `plan`'s job, and the channel/version model
 * lands in a later PR). Everything downstream is bound to `intentSha256`, so a
 * swapped or hand-edited intent changes the digest and is rejected rather than
 * silently producing a different release.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CandidateReleaseIntentSchema,
  ReleaseIntentSchema,
  canonicalSha256,
  type ReleaseIntent,
} from '@kb-labs/release-manager-contracts';

export type CandidateReleaseIntent = Extract<ReleaseIntent, { operation: 'candidate' }>;

export interface LoadedIntent {
  path: string;
  intent: CandidateReleaseIntent;
  /** Digest every later stage is bound to; recorded in bundle and provenance. */
  intentSha256: string;
}

/**
 * The digest covers the intent exactly as written, signature included.
 *
 * Excluding the signature would let a resigned-but-otherwise-identical intent
 * pass as the same document; including it means the approval and the bundle
 * always refer to one byte-identical decision.
 */
export function intentSha256(intent: ReleaseIntent): string {
  return canonicalSha256(intent);
}

export function loadCandidateIntent(path: string): LoadedIntent {
  const absolute = resolve(path);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`intent is not readable JSON (${absolute}): ${(error as Error).message}`);
  }

  const parsed = ReleaseIntentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`intent does not match kb.release-intent/1: ${parsed.error.message}`);
  }
  if (parsed.data.operation !== 'candidate') {
    // A promotion intent mutates nothing and builds nothing; accepting one here
    // would stage a worktree for a release that already exists.
    throw new Error('release stage/package/seal require a candidate intent, not a promotion intent');
  }

  const intent = CandidateReleaseIntentSchema.parse(parsed.data);
  const names = intent.packageSet.map(entry => entry.name);
  if (new Set(names).size !== names.length) {
    throw new Error('intent packageSet lists the same package more than once');
  }

  return { path: absolute, intent, intentSha256: intentSha256(intent) };
}
