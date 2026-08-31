/**
 * `ReleaseSupportPolicy` generation and sealing (cutover plan §4.9, execution
 * plan §7.7 "В PR 4").
 *
 * The plugin generates and seals the exact bytes; CI publishes them unmodified
 * and never decides the list contents (a policy test in PR 6 enforces that).
 *
 * Two invariants are the reason this is code rather than a template.
 *
 * **1. `minimumSupported` is monotonic.** It may only move forward. Moving it
 * backwards would silently un-retire releases that consumers were already told
 * are out of support, and — because the document is mutable and cached — would
 * do so at an unpredictable time for each consumer. A publish that lowers it is
 * rejected against the previously sealed policy.
 *
 * **2. Burned versions appear nowhere.** A canary that was reserved and then
 * rejected or cancelled was never activated; it is neither supported nor
 * *retired*, because retirement describes a release that used to be available.
 * Listing one under either key would tell `kb-create` that bytes exist which
 * never did. §7.3 gives such versions their own diagnostic
 * (`KB_CREATE_RELEASE_NOT_ACTIVATED`) precisely so they can stay out of both
 * lists.
 *
 * Scope reminder from §4.9: channel resolution never reads this document, so
 * none of this can block the primary install path.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BURNED_LEDGER_STATES,
  ReleaseControlDiagnosticCode,
  ReleaseSupportPolicySchema,
  canonicalSha256,
  type ReleaseLedgerEntry,
  type ReleaseSupportPolicy,
} from '@kb-labs/release-manager-contracts';
import semver from 'semver';

export function supportPolicyPath(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'support', 'support-policy.json');
}

export class SupportPolicyError extends Error {
  readonly code: ReleaseControlDiagnosticCode;

  constructor(code: ReleaseControlDiagnosticCode, message: string) {
    super(message);
    this.name = 'SupportPolicyError';
    this.code = code;
  }
}

/** `platform-2.120.0` — the release-id form §4.9's lists use. */
export function releaseIdFor(flow: string, version: string): string {
  return `${flow}-${version}`;
}

function versionOfReleaseId(releaseId: string): string | null {
  const version = releaseId.slice(releaseId.lastIndexOf('-') + 1);
  return semver.valid(version) ? version : null;
}

export interface BuildSupportPolicyInput {
  flow: string;
  entries: readonly ReleaseLedgerEntry[];
  /** Oldest release id that is still supported. Must not move backwards. */
  minimumSupported: string;
  legacyNotice: string;
  /** Reasons for retirement, keyed by release id. Defaults to `superseded`. */
  retirementReasons?: Record<string, string>;
  generatedAt?: string;
  /** The last policy that was sealed; monotonicity is checked against it. */
  previous?: ReleaseSupportPolicy | null;
}

/**
 * Builds a policy from the ledger and rejects it if it violates either invariant.
 *
 * Membership is derived from ledger state, never hand-listed: a release is
 * supported if it was activated and is at or above `minimumSupported`, retired
 * if it was activated and has fallen below it, and absent entirely if it was
 * never activated.
 */
export function buildSupportPolicy(input: BuildSupportPolicyInput): ReleaseSupportPolicy {
  const flowEntries = input.entries.filter(entry => entry.flow === input.flow);

  const burned = new Set(
    flowEntries
      .filter(entry => BURNED_LEDGER_STATES.includes(entry.state))
      .map(entry => releaseIdFor(input.flow, entry.version)),
  );

  const minimumVersion = versionOfReleaseId(input.minimumSupported);
  if (!minimumVersion) {
    throw new SupportPolicyError(
      ReleaseControlDiagnosticCode.SupportPolicyNotMonotonic,
      `minimumSupported "${input.minimumSupported}" does not carry a valid SemVer version.`,
    );
  }
  if (burned.has(input.minimumSupported)) {
    throw new SupportPolicyError(
      ReleaseControlDiagnosticCode.SupportPolicyBurnedVersion,
      `minimumSupported "${input.minimumSupported}" is a burned version that was never activated.`,
    );
  }

  // Invariant 1 — checked before anything is built, so a rejected policy never
  // exists as bytes that could be sealed by mistake.
  if (input.previous) {
    const previousMinimum = versionOfReleaseId(input.previous.minimumSupported);
    if (previousMinimum && semver.lt(minimumVersion, previousMinimum)) {
      throw new SupportPolicyError(
        ReleaseControlDiagnosticCode.SupportPolicyNotMonotonic,
        `minimumSupported may only move forward: ${input.previous.minimumSupported} → ${input.minimumSupported} ` +
        'would un-retire releases consumers were already told are out of support.',
      );
    }
  }

  // Invariant 2 — a version is listed only if it was actually activated.
  // `published` alone is not enough: bytes on a registry that no channel
  // pointer ever resolved to are not a release anyone could have installed
  // through the supported path.
  const activated = flowEntries.filter(entry =>
    entry.state === 'active-canary' || entry.state === 'promoted-stable');

  const supported: string[] = [];
  const retired: ReleaseSupportPolicy['retired'] = [];
  const ordered = [...activated].sort((a, b) => semver.compare(a.version, b.version));

  for (const [index, entry] of ordered.entries()) {
    const releaseId = releaseIdFor(input.flow, entry.version);
    if (semver.gte(entry.version, minimumVersion)) {
      supported.push(releaseId);
      continue;
    }
    const replacement = ordered[index + 1];
    retired.push({
      releaseId,
      reason: input.retirementReasons?.[releaseId] ?? 'superseded',
      ...(replacement ? { replacedBy: releaseIdFor(input.flow, replacement.version) } : {}),
    });
  }

  const policy = ReleaseSupportPolicySchema.parse({
    schema: 'kb.release-support/1',
    contract: 'kb.release/1',
    minimumSupported: input.minimumSupported,
    supported,
    retired,
    legacyNotice: input.legacyNotice,
    generatedAt: input.generatedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    signature: null,
  });

  assertNoBurnedVersions(policy, burned);
  return policy;
}

/**
 * Independent re-check of invariant 2 over finished bytes.
 *
 * Derivation could be correct today and be broken by a future edit to the
 * membership rules above; this guard is over the *document*, so it keeps
 * holding regardless of how the document came to be. It is also what PR 6's
 * policy test can call against a published policy.
 */
export function assertNoBurnedVersions(policy: ReleaseSupportPolicy, burnedReleaseIds: ReadonlySet<string>): void {
  const offenders = [
    ...policy.supported.filter(id => burnedReleaseIds.has(id)),
    ...policy.retired.map(entry => entry.releaseId).filter(id => burnedReleaseIds.has(id)),
  ];
  if (offenders.length > 0) {
    throw new SupportPolicyError(
      ReleaseControlDiagnosticCode.SupportPolicyBurnedVersion,
      `Burned versions must appear in neither supported nor retired: ${offenders.join(', ')}. ` +
      'They were reserved and abandoned, never activated, so there is nothing to support or retire.',
    );
  }
}

export interface SealedSupportPolicy {
  policy: ReleaseSupportPolicy;
  path: string;
  sha256: string;
}

/**
 * Writes the policy and returns the digest CI publishes it under.
 *
 * Monotonicity is re-checked here against whatever is on disk rather than only
 * against the `previous` the caller passed: sealing is the point at which the
 * document becomes real, and the on-disk policy is the only thing that can
 * still contradict it.
 */
export function sealSupportPolicy(repoRoot: string, policy: ReleaseSupportPolicy): SealedSupportPolicy {
  const path = supportPolicyPath(repoRoot);
  const previous = readSupportPolicy(repoRoot);
  if (previous) {
    const previousMinimum = versionOfReleaseId(previous.minimumSupported);
    const nextMinimum = versionOfReleaseId(policy.minimumSupported);
    if (previousMinimum && nextMinimum && semver.lt(nextMinimum, previousMinimum)) {
      throw new SupportPolicyError(
        ReleaseControlDiagnosticCode.SupportPolicyNotMonotonic,
        `Refusing to seal a support policy whose minimumSupported moves backwards: ` +
        `${previous.minimumSupported} → ${policy.minimumSupported}.`,
      );
    }
  }

  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`);
  return { policy, path, sha256: canonicalSha256(policy) };
}

export function readSupportPolicy(repoRoot: string): ReleaseSupportPolicy | null {
  const path = supportPolicyPath(repoRoot);
  if (!existsSync(path)) { return null; }
  return ReleaseSupportPolicySchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
