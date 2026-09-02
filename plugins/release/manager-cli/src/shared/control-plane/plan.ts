/**
 * Channel-aware, ledger-reserved candidate planning.
 *
 * This is the step that used to be missing between "compute some bumps" and
 * PR 3's `stage → package → seal → commit` pipeline. `stage` takes an
 * already-fully-formed `intent.json` and computes no version policy of its own;
 * this module is what produces that intent, and it is the only place where the
 * channel decision, the ledger reservation and the changelog freeze meet.
 *
 * Order matters and is not arbitrary:
 *
 * 1. **Channel first.** An `experimental` target must be rejected before
 *    anything is written, otherwise a rejected release still burns a version.
 * 2. **Reserve before freezing.** The changelog names the version, so the
 *    version has to exist first.
 * 3. **Freeze before the intent digest.** The intent binds the mutation plan,
 *    which binds the changelog bytes. Freezing afterwards would mean the digest
 *    covered bytes that could still change.
 *
 * The reservation is executed here only because Workflow does not exist yet
 * (PR 5). `buildVersionProposal` and `reserveVersion` are deliberately separate
 * so PR 5 can take the proposal, do the compare-and-set itself against the
 * durable store, and hand the allocated version back — without this module
 * changing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CandidateReleaseIntentSchema,
  type ReleaseControlChannel,
  type ReleaseException,
  type ReleaseLedgerEntry,
  type ReleaseVersionProposal,
} from '@kb-labs/release-manager-contracts';
import { ReleaseChannelError, resolveRequestedChannel } from '@kb-labs/release-manager-core';

import { intentSha256, type CandidateReleaseIntent } from '../bundle/intent.js';
import { buildMutationPlan, mutationSha256 } from '../bundle/mutations.js';
import { freezeChangelog, type FreezeChangelogResult } from './changelog-freeze.js';
import { readExceptions } from './exception.js';
import { reserveVersion, type ReleaseLedgerStore } from './ledger.js';
import { buildVersionProposal, type ProposalBump } from './version-policy.js';

export { ReleaseChannelError, resolveRequestedChannel };

export interface PlanCandidateInput {
  repoRoot: string;
  flow: string;
  /** Raw `--target` value; validated here, not by the caller. */
  requestedTarget: string;
  bump: ProposalBump;
  /** Packages the release covers, with the versions currently on disk. */
  packages: readonly { name: string; currentVersion: string }[];
  plannedCommit: string;
  branch: string;
  store: ReleaseLedgerStore;
  /** Worktree-relative POSIX path → changelog bytes to freeze. */
  changelogs: Record<string, string>;
  planSha256: string;
  candidateId?: string;
  now?: () => string;
}

export interface PlanCandidateResult {
  channel: ReleaseControlChannel;
  proposal: ReleaseVersionProposal;
  reservation: ReleaseLedgerEntry;
  changelog: FreezeChangelogResult;
  intent: CandidateReleaseIntent;
  intentSha256: string;
  intentPath: string;
  /** Exceptions already recorded against this candidate — see `exception.ts`. */
  exceptions: ReleaseException[];
  stablePromotionForbidden: boolean;
}

export class ReleasePlanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ReleasePlanError';
    this.code = code;
  }
}

export function intentPathFor(repoRoot: string, candidateId: string): string {
  return join(repoRoot, '.kb', 'release', 'candidates', candidateId, 'intent.json');
}

export async function planCandidate(input: PlanCandidateInput): Promise<PlanCandidateResult> {
  const now = input.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));

  // 1. Channel policy. Throws ReleaseChannelError with a typed code for both
  // `experimental` (reserved, decision S0.3d) and unknown targets.
  const channel = resolveRequestedChannel(input.requestedTarget);
  if (channel === 'stable') {
    // §3: stable creates no version, bytes, bundle or manifest — it moves a
    // pointer onto an already-published canary. Planning a stable *candidate*
    // would allocate a version for a release that must not have one.
    throw new ReleasePlanError(
      'KB_RELEASE_STABLE_NOT_A_CANDIDATE',
      'stable is a promotion of an existing canary, not a candidate: it creates no version, bytes or bundle. ' +
      'Plan with --target canary, then promote the resulting candidate.',
    );
  }

  const candidateId = input.candidateId ?? `${input.flow}-${input.plannedCommit.slice(0, 12)}`;

  // 2. Version policy + reservation.
  const entries = await input.store.read();
  const proposal = buildVersionProposal({
    flow: input.flow,
    channel,
    candidateId,
    bump: input.bump,
    entries,
    workspaceVersions: input.packages.map(pkg => pkg.currentVersion),
    proposedAt: now(),
  });

  const reserved = await reserveVersion(input.store, proposal, { now });
  if (!reserved.ok) {
    throw new ReleasePlanError(reserved.code, reserved.message);
  }

  const version = reserved.entry.version;
  const releaseId = reserved.entry.releaseId;

  // 3. Freeze the changelog bytes. From here the text cannot be regenerated for
  // this candidate — a second attempt with different bytes is rejected.
  const changelog = freezeChangelog({
    repoRoot: input.repoRoot,
    flow: input.flow,
    candidateId,
    entries: input.changelogs,
    frozenAt: now(),
  });

  // 4. Build the intent PR 3's `stage` consumes. The mutation plan is derived
  // from the package set and the frozen changelog, so `mutationSha256` — and
  // therefore `intentSha256` — covers the exact bytes that will be applied.
  const packageSet = input.packages.map(pkg => ({ name: pkg.name, version }));
  const draft = {
    schema: 'kb.release-intent/1' as const,
    operation: 'candidate' as const,
    releaseId,
    candidateId,
    source: { plannedCommit: input.plannedCommit, branch: input.branch },
    flow: input.flow,
    requestedTarget: 'canary' as const,
    planSha256: input.planSha256,
    mutationSha256: '0'.repeat(64),
    packageSet,
    signature: null,
  } as CandidateReleaseIntent;

  const plan = buildMutationPlan(input.repoRoot, draft, {
    changelogs: Object.fromEntries(changelog.frozen.entries.map(entry => [entry.path, entry.content])),
  });
  const intent = CandidateReleaseIntentSchema.parse({
    ...draft,
    mutationSha256: mutationSha256(plan),
  }) as CandidateReleaseIntent;

  const intentPath = intentPathFor(input.repoRoot, candidateId);
  mkdirSync(join(intentPath, '..'), { recursive: true });
  writeFileSync(intentPath, `${JSON.stringify(intent, null, 2)}\n`);

  const exceptions = readExceptions(input.repoRoot, candidateId);

  return {
    channel,
    proposal,
    reservation: reserved.entry,
    changelog,
    intent,
    intentSha256: intentSha256(intent),
    intentPath,
    exceptions,
    stablePromotionForbidden: exceptions.length > 0,
  };
}
