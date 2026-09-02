/**
 * Version policy (cutover plan §3, execution plan PR 4 item 2).
 *
 * The baseline for the next release is **the highest version the ledger has
 * ever allocated across all channels** — not the current stable pointer, and
 * not npm dist-tag discovery.
 *
 * Both rejected alternatives are wrong for the same reason: they only see
 * versions that *succeeded*. With `stable=1.19.2` there can be immutable
 * canaries at `1.20.0 … 1.22.33`; deriving from the stable pointer would
 * propose `1.19.3` and collide with all of them. npm dist-tags are worse still:
 * they lag propagation, they omit anything reserved-but-not-yet-published, and
 * they are mutable state owned by a third party.
 *
 * The workspace is consulted only as the *first* baseline for a flow that has
 * no ledger history at all. After that the ledger is the only source, because
 * `package.json` cannot know about a version a concurrent workflow reserved
 * thirty seconds ago.
 */

import {
  ReleaseVersionProposalSchema,
  type ReleaseControlChannel,
  type ReleaseLedgerEntry,
  type ReleaseVersionProposal,
} from '@kb-labs/release-manager-contracts';
import semver from 'semver';

import { allocatedVersions } from './ledger.js';

export type ProposalBump = 'patch' | 'minor' | 'major';

export interface VersionBaseline {
  version: string | null;
  source: 'ledger' | 'workspace' | 'none';
}

/**
 * Highest allocated version for a flow, in any state on any channel.
 *
 * Burned versions (`rejected`, `cancelled`) count. A version that was reserved
 * and then abandoned still moved the baseline forward — that is exactly what
 * "gaps are fine, reuse is not" means.
 */
export function ledgerBaseline(
  entries: readonly ReleaseLedgerEntry[],
  flow: string,
  workspaceVersions: readonly string[] = [],
): VersionBaseline {
  const fromLedger = allocatedVersions(entries, flow).filter(v => semver.valid(v));
  if (fromLedger.length > 0) {
    return { version: fromLedger.sort(semver.rcompare)[0]!, source: 'ledger' };
  }
  const fromWorkspace = workspaceVersions.filter(v => semver.valid(v));
  if (fromWorkspace.length > 0) {
    return { version: fromWorkspace.slice().sort(semver.rcompare)[0]!, source: 'workspace' };
  }
  return { version: null, source: 'none' };
}

export interface VersionProposalInput {
  flow: string;
  channel: ReleaseControlChannel;
  candidateId: string;
  bump: ProposalBump;
  entries: readonly ReleaseLedgerEntry[];
  /** Versions currently on disk; used only when the flow has no ledger history. */
  workspaceVersions?: readonly string[];
  /** Fixed timestamp for deterministic tests. */
  proposedAt?: string;
}

/**
 * Builds the reservation proposal the control plane will compare-and-set.
 *
 * The plugin does not write the ledger (execution plan §3.2). What it produces
 * is a candidate number *plus the preconditions that made it correct*, so the
 * writer can tell whether the reasoning is still valid at write time instead of
 * having to redo it.
 */
export function buildVersionProposal(input: VersionProposalInput): ReleaseVersionProposal {
  const baseline = ledgerBaseline(input.entries, input.flow, input.workspaceVersions ?? []);
  const known = allocatedVersions(input.entries, input.flow);
  const knownSet = new Set(known);

  // First release of a flow with nothing anywhere: 0.1.0 rather than 0.0.0, so
  // the very first allocation is still a real, publishable version.
  let candidate = baseline.version
    ? semver.inc(baseline.version, input.bump)
    : (input.bump === 'major' ? '1.0.0' : '0.1.0');
  if (!candidate) {
    throw new Error(`Cannot compute a ${input.bump} bump from ${baseline.version ?? 'no baseline'}`);
  }

  // Step past anything already allocated. This can only trigger when the
  // requested bump lands on a burned version — e.g. `1.20.0` was reserved and
  // rejected, and the next release also wants a minor. Advancing by patch
  // rather than repeating the bump keeps the step minimal while still
  // guaranteeing "never reused".
  while (knownSet.has(candidate)) {
    const next: string | null = semver.inc(candidate, 'patch');
    if (!next) { throw new Error(`Cannot advance past allocated version ${candidate}`); }
    candidate = next;
  }

  // The CAS token spans the *whole* ledger, not just this flow: the tail
  // sequence is a property of the log, and a concurrent reservation for another
  // flow still moves it. Recomputing on that conflict is cheap; sharing a
  // sequence number is not recoverable.
  const tail = input.entries.length === 0
    ? -1
    : input.entries[input.entries.length - 1]!.sequence;

  return ReleaseVersionProposalSchema.parse({
    schema: 'kb.release-version-proposal/1',
    flow: input.flow,
    channel: input.channel,
    candidateId: input.candidateId,
    baselineVersion: baseline.version,
    baselineSource: baseline.source,
    version: candidate,
    bump: input.bump,
    preconditions: {
      expectedTailSequence: tail,
      knownVersions: known,
    },
    proposedAt: input.proposedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    signature: null,
  });
}
