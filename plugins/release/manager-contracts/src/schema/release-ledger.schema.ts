/**
 * Channel policy, version ledger, check reports and break-glass exceptions
 * (cutover plan §3 and §6A.3, execution plan PR 4).
 *
 * These are the documents the plugin *produces* so that the control plane can
 * decide. The plugin never owns operational state: it computes a reservation
 * *proposal* and the preconditions under which that proposal is still valid,
 * and Workflow performs the compare-and-set against the ledger (execution plan
 * §3.2). Keeping the proposal a signed-over document rather than a function
 * call is what lets the two live in different processes later.
 *
 * Everything here is `.strict()` for the same reason as the rest of the control
 * plane: an unknown field would mean the decider and the decided-upon are
 * looking at different payloads.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { ReleaseControlChannelSchema } from './release-control-plane.schema';

const nonEmpty = z.string().min(1);
const rfc3339 = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'expected lowercase SHA-256 hex');
const signature = z.string().min(1).nullable().optional();
const semverString = z.string().regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  'expected a SemVer version',
);

/**
 * Lifecycle of a single allocated version (cutover plan §3).
 *
 * `cancelled` and `rejected` are terminal *and still occupy the number*: a
 * version that was ever handed out is never handed out again, so a burned
 * canary costs a gap in the sequence rather than an ambiguous identity.
 */
export const ReleaseLedgerStateSchema = z.enum([
  'reserved',
  'published',
  'active-canary',
  'rejected',
  'promoted-stable',
  'cancelled',
]);
export type ReleaseLedgerState = z.infer<typeof ReleaseLedgerStateSchema>;

/** States in which the version was never publicly activated — see §7.3 / support policy. */
export const BURNED_LEDGER_STATES: readonly ReleaseLedgerState[] = ['rejected', 'cancelled'];

/** States in which the version reached real users through a channel pointer. */
export const ACTIVATED_LEDGER_STATES: readonly ReleaseLedgerState[] = ['active-canary', 'promoted-stable'];

export const ReleaseLedgerTransitions = [
  ['reserved', 'published'],
  ['reserved', 'rejected'],
  ['reserved', 'cancelled'],
  ['published', 'active-canary'],
  ['published', 'rejected'],
  ['published', 'cancelled'],
  ['active-canary', 'promoted-stable'],
  ['active-canary', 'rejected'],
  ['promoted-stable', 'rejected'],
] as const satisfies ReadonlyArray<readonly [ReleaseLedgerState, ReleaseLedgerState]>;

export function isAllowedLedgerTransition(from: ReleaseLedgerState, to: ReleaseLedgerState): boolean {
  return ReleaseLedgerTransitions.some(([f, t]) => f === from && t === to);
}

const LedgerTransitionSchema = z.object({
  from: ReleaseLedgerStateSchema.nullable(),
  to: ReleaseLedgerStateSchema,
  at: rfc3339,
  actor: nonEmpty,
  reason: z.string().min(1).optional(),
}).strict();

/**
 * One immutable version allocation.
 *
 * `sequence` is the ledger's own monotonic counter, not derived from the
 * version: it is what makes "append-only, compare-and-set on the tail" a
 * well-defined operation regardless of how versions sort.
 */
export const ReleaseLedgerEntrySchema = z.object({
  schema: z.literal('kb.release-ledger-entry/1'),
  sequence: z.number().int().nonnegative(),
  flow: nonEmpty,
  version: semverString,
  /** Channel the version was allocated *for*. Promotion never re-allocates. */
  channel: ReleaseControlChannelSchema,
  state: ReleaseLedgerStateSchema,
  releaseId: nonEmpty,
  candidateId: nonEmpty,
  reservedAt: rfc3339,
  updatedAt: rfc3339,
  transitions: z.array(LedgerTransitionSchema),
  signature,
}).strict();
export type ReleaseLedgerEntry = z.infer<typeof ReleaseLedgerEntrySchema>;

/**
 * Plugin → Workflow: "this is the version I believe is next, and this is what
 * must still be true when you write it".
 *
 * `preconditions.expectedTailSequence` is the compare-and-set token. If another
 * workflow reserved in the meantime the tail moved, the CAS fails, and the
 * caller recomputes rather than colliding — which is exactly the race the
 * concurrency test in PR 4 pins down.
 */
export const ReleaseVersionProposalSchema = z.object({
  schema: z.literal('kb.release-version-proposal/1'),
  flow: nonEmpty,
  channel: ReleaseControlChannelSchema,
  /**
   * No `releaseId` here on purpose: release identity is `<flow>-<version>`, and
   * the version is not decided until the compare-and-set succeeds. A proposal
   * carrying one would have to invent a placeholder, and that placeholder would
   * end up in the ledger entry as the release's permanent identity.
   */
  candidateId: nonEmpty,
  /** Highest version known across *all* channels, or null for the first release of a flow. */
  baselineVersion: semverString.nullable(),
  /** Where the baseline came from — a ledger entry, or the working tree on first use. */
  baselineSource: z.enum(['ledger', 'workspace', 'none']),
  version: semverString,
  bump: z.enum(['patch', 'minor', 'major']),
  preconditions: z.object({
    expectedTailSequence: z.number().int().gte(-1),
    /** Every version the ledger already knows. The CAS refuses if `version` is among them. */
    knownVersions: z.array(semverString),
  }).strict(),
  proposedAt: rfc3339,
  signature,
}).strict();
export type ReleaseVersionProposal = z.infer<typeof ReleaseVersionProposalSchema>;

// ── checks (cutover plan §6A.3) ─────────────────────────────────────────────

/**
 * `post-delivery` is separate from `delivery` on purpose: delivery evidence is
 * about the registry accepting bytes, post-delivery is about a real consumer
 * installing them. They fail for unrelated reasons and gate different
 * transitions.
 */
export const ReleaseCheckStageSchema = z.enum(['source', 'artifact', 'delivery', 'post-delivery']);
export type ReleaseCheckStage = z.infer<typeof ReleaseCheckStageSchema>;

/**
 * `not-implemented` is a first-class status rather than a silent pass: PR 4
 * ships typed stubs for the delivery/post-delivery groups whose executors land
 * with CI (PR 6) and `kb-create` (PR 7). A stub that reported `passed` would
 * make an unimplemented gate look satisfied.
 */
export const ReleaseCheckStatusSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'excepted',
  'not-implemented',
]);
export type ReleaseCheckStatus = z.infer<typeof ReleaseCheckStatusSchema>;

export const ReleaseCheckDiagnosticSchema = z.object({
  code: nonEmpty,
  message: nonEmpty,
  subject: z.string().min(1).optional(),
  severity: z.enum(['error', 'warning', 'info']),
}).strict();
export type ReleaseCheckDiagnostic = z.infer<typeof ReleaseCheckDiagnosticSchema>;

/** The exact per-check shape §6A.3 requires Workflow to consume instead of stdout. */
export const ReleaseCheckRecordSchema = z.object({
  id: nonEmpty,
  stage: ReleaseCheckStageSchema,
  required: z.boolean(),
  status: ReleaseCheckStatusSchema,
  startedAt: rfc3339,
  endedAt: rfc3339,
  /** Opaque handle to the retained output. Null when the check produced none. */
  evidenceRef: nonEmpty.nullable(),
  diagnostics: z.array(ReleaseCheckDiagnosticSchema),
}).strict();
export type ReleaseCheckRecord = z.infer<typeof ReleaseCheckRecordSchema>;

/** What a check group blocks if it fails — the "Blocks" column of the §6A.3 table. */
export const ReleaseCheckGateSchema = z.enum([
  'packaging',
  'approval',
  'sealing',
  'delivery',
  'stable-approval',
  'next-transition',
  'stable-transition',
]);
export type ReleaseCheckGate = z.infer<typeof ReleaseCheckGateSchema>;

export const ReleaseCheckReportSchema = z.object({
  schema: z.literal('kb.release-check-report/1'),
  flow: nonEmpty,
  channel: ReleaseControlChannelSchema,
  candidateId: nonEmpty,
  ok: z.boolean(),
  /** Gates that are *not* satisfied by this report. Empty iff `ok`. */
  blockedGates: z.array(ReleaseCheckGateSchema),
  checks: z.array(ReleaseCheckRecordSchema),
  generatedAt: rfc3339,
  signature,
}).strict();
export type ReleaseCheckReport = z.infer<typeof ReleaseCheckReportSchema>;

// ── break-glass (cutover plan §6A.3, decision S0.3e) ────────────────────────

/**
 * Replacement for `--skip-checks`.
 *
 * `stablePromotionForbidden` is a literal `true`, not a boolean: an exception
 * that could carry `false` would be an override switch, and the whole point is
 * that the trade is irreversible. There is deliberately no second approval
 * (decision S0.3e) — the cost is paid in permanently losing stable eligibility,
 * not in ceremony.
 */
export const ReleaseExceptionSchema = z.object({
  schema: z.literal('kb.release-exception/1'),
  exceptionId: nonEmpty,
  flow: nonEmpty,
  candidateId: nonEmpty,
  /** Check IDs this exception waives. An empty list would be a blanket override. */
  checkIds: z.array(nonEmpty).min(1),
  reason: z.string().min(8, 'an exception reason must be a sentence, not a placeholder'),
  operator: nonEmpty,
  createdAt: rfc3339,
  expiresAt: rfc3339,
  stablePromotionForbidden: z.literal(true),
  signature,
}).strict();
export type ReleaseException = z.infer<typeof ReleaseExceptionSchema>;

// ── changelog freeze (cutover plan §3B) ─────────────────────────────────────

/**
 * The exact changelog bytes a candidate will ship, fixed before anything can
 * approve them.
 *
 * Non-determinism (LLM generation) is legitimate *once*. This document is what
 * makes a second generation for the same candidate a rejected operation rather
 * than a silent substitution of the approved text.
 */
export const FrozenChangelogSchema = z.object({
  schema: z.literal('kb.release-changelog-freeze/1'),
  candidateId: nonEmpty,
  flow: nonEmpty,
  frozenAt: rfc3339,
  /** Digest over the whole `entries` map — this is what the intent binds to. */
  changelogSha256: sha256,
  entries: z.array(z.object({
    /** Worktree-relative, POSIX-separated, matching the mutation plan. */
    path: z.string().min(1).refine(
      value => !value.startsWith('/') && !value.includes('..'),
      'expected a worktree-relative path',
    ),
    sha256,
    bytes: z.number().int().nonnegative(),
    content: z.string(),
  }).strict()).min(1),
  signature,
}).strict();
export type FrozenChangelog = z.infer<typeof FrozenChangelogSchema>;

const ledgerSchemas = {
  ReleaseLedgerEntry: ReleaseLedgerEntrySchema,
  ReleaseVersionProposal: ReleaseVersionProposalSchema,
  ReleaseCheckReport: ReleaseCheckReportSchema,
  ReleaseException: ReleaseExceptionSchema,
  FrozenChangelog: FrozenChangelogSchema,
} as const;

const ledgerSchemaIds: Record<keyof typeof ledgerSchemas, string> = {
  ReleaseLedgerEntry: 'kb.release-ledger-entry/1',
  ReleaseVersionProposal: 'kb.release-version-proposal/1',
  ReleaseCheckReport: 'kb.release-check-report/1',
  ReleaseException: 'kb.release-exception/1',
  FrozenChangelog: 'kb.release-changelog-freeze/1',
};

export const releaseLedgerJsonSchemas = Object.fromEntries(
  Object.entries(ledgerSchemas).map(([name, schema]) => [name, zodToJsonSchema(schema, {
    name,
    $refStrategy: 'none',
  })]),
) as Record<keyof typeof ledgerSchemas, ReturnType<typeof zodToJsonSchema>>;

for (const [name, id] of Object.entries(ledgerSchemaIds)) {
  const target = (releaseLedgerJsonSchemas as Record<string, { $id?: string }>)[name];
  if (target) {
    target.$id = `https://schemas.kb-labs.dev/release-control-plane/${id.replace('/', '-')}.schema.json`;
  }
}

/**
 * Diagnostic vocabulary for channel/version/check/exception rejections.
 *
 * These are the codes the plugin emits instead of a free-text error, so that
 * Workflow and the CLI render the same decision without string matching.
 */
export const ReleaseControlDiagnosticCode = {
  /** `--target experimental` — the channel exists in the contracts, not in this cutover (§3.3). */
  ExperimentalChannelUnavailable: 'KB_RELEASE_CHANNEL_EXPERIMENTAL_UNAVAILABLE',
  /** A target that is not one of the three channels at all. */
  UnknownChannel: 'KB_RELEASE_CHANNEL_UNKNOWN',
  /** `experimental` can never be the source of a stable promotion (§3). */
  ExperimentalStableForbidden: 'KB_RELEASE_CHANNEL_EXPERIMENTAL_STABLE_FORBIDDEN',
  /** The proposed version already exists in the ledger in any state. */
  VersionAlreadyAllocated: 'KB_RELEASE_VERSION_ALREADY_ALLOCATED',
  /** Ledger tail moved between proposal and compare-and-set. */
  ReservationConflict: 'KB_RELEASE_RESERVATION_CONFLICT',
  /** Proposed version is not strictly greater than the ledger baseline. */
  VersionNotMonotonic: 'KB_RELEASE_VERSION_NOT_MONOTONIC',
  /** A second changelog generation for a candidate whose bytes are already frozen. */
  ChangelogAlreadyFrozen: 'KB_RELEASE_CHANGELOG_ALREADY_FROZEN',
  /** `minimumSupported` would move backwards relative to the previous sealed policy. */
  SupportPolicyNotMonotonic: 'KB_RELEASE_SUPPORT_POLICY_NOT_MONOTONIC',
  /** A burned (reserved-then-rejected/cancelled) version appears in `supported`/`retired`. */
  SupportPolicyBurnedVersion: 'KB_RELEASE_SUPPORT_POLICY_BURNED_VERSION',
  /** A required check failed and no exception covers it. */
  RequiredCheckFailed: 'KB_RELEASE_CHECK_REQUIRED_FAILED',
} as const;
export type ReleaseControlDiagnosticCode =
  typeof ReleaseControlDiagnosticCode[keyof typeof ReleaseControlDiagnosticCode];
