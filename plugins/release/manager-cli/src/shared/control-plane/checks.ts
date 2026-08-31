/**
 * Staged release checks (cutover plan §6A.3, execution plan PR 4 items 4–5).
 *
 * Two things are being fixed here relative to the pre-cutover runner.
 *
 * 1. **Stage.** Checks used to be one flat list. They are now bound to the
 *    lifecycle point where their evidence can exist at all: a source check runs
 *    against a tree, an artifact check against a sealed bundle, a delivery
 *    check against a registry that has actually received bytes. Running an
 *    artifact check before packaging is not "early", it is meaningless.
 *
 * 2. **Report, not stdout.** Workflow consumes
 *    `{id, stage, required, status, startedAt, endedAt, evidenceRef, diagnostics}`.
 *    Every diagnostic carries a code, mirroring the bundle verifier introduced
 *    in PR 2 — the two reports are read by the same consumer and there is no
 *    reason for them to have two shapes.
 *
 * The plugin owns the definitions *and* the pass/fail policy. CI performs the
 * network action a delivery check observes; it never decides whether an
 * observed failure may be ignored, and it never receives an override flag.
 *
 * ## Stubs
 *
 * The `delivery` and `post-delivery` groups are declared here with real ids,
 * gates and `required` flags but no executor: their evidence comes from CI
 * (PR 6) and `kb-create` (PR 7). They report `not-implemented`, never `passed`,
 * so an unimplemented gate can never be mistaken for a satisfied one — while
 * still giving PR 5/6/7 a typed slot to fill rather than a shape to invent.
 */

import {
  ReleaseCheckReportSchema,
  ReleaseControlDiagnosticCode,
  type ReleaseCheckDiagnostic,
  type ReleaseCheckGate,
  type ReleaseCheckRecord,
  type ReleaseCheckReport,
  type ReleaseCheckStage,
  type ReleaseControlChannel,
  type ReleaseException,
} from '@kb-labs/release-manager-contracts';

export interface ReleaseCheckContext {
  repoRoot: string;
  flow: string;
  channel: ReleaseControlChannel;
  candidateId: string;
  /** Sealed bundle directory; absent before `release seal`. */
  bundleDir?: string;
}

export interface ReleaseCheckOutcome {
  ok: boolean;
  diagnostics: ReleaseCheckDiagnostic[];
  /** Opaque handle to retained output (a log path, a bundle digest, …). */
  evidenceRef?: string | null;
}

export interface ReleaseCheckDefinition {
  id: string;
  stage: ReleaseCheckStage;
  gate: ReleaseCheckGate;
  /** Human summary used by the CLI renderer; never parsed. */
  title: string;
  /**
   * Whether a failure blocks the gate. Non-required checks still appear in the
   * report with their diagnostics — "optional" means "does not block", never
   * "not reported".
   */
  required: boolean;
  /** Restricts the check to specific channels. Absent means all channels. */
  channels?: readonly ReleaseControlChannel[];
  /**
   * Absent executor = declared-but-not-implemented (see module docs). Present
   * executor = the plugin evaluates it and owns the verdict.
   */
  run?: (ctx: ReleaseCheckContext) => Promise<ReleaseCheckOutcome> | ReleaseCheckOutcome;
}

/**
 * The check groups of the §6A.3 table, in lifecycle order.
 *
 * Ids are stable and are what `release exception create --check <id>` waives,
 * so they are part of the operator-facing contract, not internal labels.
 */
export const RELEASE_CHECK_GROUPS: readonly ReleaseCheckDefinition[] = [
  {
    id: 'source.branch-clean-tag-intent',
    stage: 'source',
    gate: 'packaging',
    title: 'Branch, clean tree, tag availability and intent binding',
    required: true,
  },
  {
    id: 'source.lockfile-toolchain-dependency-direction',
    stage: 'source',
    gate: 'packaging',
    title: 'Lockfile integrity, toolchain pin and dependency direction',
    required: true,
  },
  {
    id: 'source.build-lint-typecheck-unit',
    stage: 'source',
    gate: 'approval',
    title: 'Build, lint, typecheck and unit integration',
    required: true,
  },
  {
    id: 'source.pack-clean-install',
    stage: 'source',
    gate: 'approval',
    title: 'npm pack plus clean consumer install',
    required: true,
  },
  {
    // §6A.3 lists this group as source/artifact and stable-only: a downgrade
    // can only be validated against the stable release it would replace, and
    // canary has no such predecessor to downgrade to.
    id: 'source.migration-rollback-class-downgrade',
    stage: 'source',
    gate: 'stable-approval',
    title: 'Migration rollback class and previous-stable downgrade validation',
    required: true,
    channels: ['stable'],
  },
  {
    id: 'artifact.package-manifest-publishability',
    stage: 'artifact',
    gate: 'sealing',
    title: 'Package manifest publishability',
    required: true,
  },
  {
    id: 'artifact.checksums-inventory-graph',
    stage: 'artifact',
    gate: 'delivery',
    title: 'Checksums, closed inventory and compatibility-graph coverage',
    required: true,
  },
  {
    // Owner is CI evidence with the policy in Workflow (PR 6). Declared here so
    // the gate exists and is typed before anything can claim to satisfy it.
    id: 'delivery.registry-propagation',
    stage: 'delivery',
    gate: 'next-transition',
    title: 'Registry propagation and downloaded-bytes verification',
    required: true,
  },
  {
    // Owner is `kb-create` with the policy in Workflow (PR 7).
    id: 'post-delivery.fresh-install-update-rollback',
    stage: 'post-delivery',
    gate: 'stable-transition',
    title: 'Fresh install, update and rollback against the published release',
    required: true,
  },
];

export function checksForStage(stage: ReleaseCheckStage): ReleaseCheckDefinition[] {
  return RELEASE_CHECK_GROUPS.filter(check => check.stage === stage);
}

export function checksForChannel(
  channel: ReleaseControlChannel,
  definitions: readonly ReleaseCheckDefinition[] = RELEASE_CHECK_GROUPS,
): ReleaseCheckDefinition[] {
  return definitions.filter(check => !check.channels || check.channels.includes(channel));
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface RunStagedChecksOptions {
  context: ReleaseCheckContext;
  stages?: readonly ReleaseCheckStage[];
  definitions?: readonly ReleaseCheckDefinition[];
  /** Active break-glass exceptions. A covered failure becomes `excepted`. */
  exceptions?: readonly ReleaseException[];
  /** Fixed clock for deterministic reports. */
  now?: () => string;
}

/**
 * An exception only counts while it is unexpired and names the check.
 *
 * TTL is enforced at evaluation time rather than at creation: an exception that
 * was valid when written but has since expired must stop waiving, otherwise
 * "TTL" would be documentation rather than a control.
 */
function coveringException(
  exceptions: readonly ReleaseException[],
  checkId: string,
  candidateId: string,
  at: string,
): ReleaseException | undefined {
  return exceptions.find(exception =>
    exception.candidateId === candidateId
    && exception.checkIds.includes(checkId)
    && Date.parse(exception.expiresAt) > Date.parse(at));
}

export async function runStagedChecks(options: RunStagedChecksOptions): Promise<ReleaseCheckReport> {
  const now = options.now ?? isoNow;
  const { context } = options;
  const stages = options.stages ?? (['source', 'artifact'] as const);
  const exceptions = options.exceptions ?? [];

  const selected = checksForChannel(context.channel, options.definitions ?? RELEASE_CHECK_GROUPS)
    .filter(check => stages.includes(check.stage));

  const records: ReleaseCheckRecord[] = [];
  for (const definition of selected) {
    const startedAt = now();

    if (!definition.run) {
      records.push({
        id: definition.id,
        stage: definition.stage,
        required: definition.required,
        status: 'not-implemented',
        startedAt,
        endedAt: now(),
        evidenceRef: null,
        diagnostics: [{
          code: 'KB_RELEASE_CHECK_NOT_IMPLEMENTED',
          message:
            `Check ${definition.id} is declared but its executor lands with the layer that owns its evidence. ` +
            'It reports not-implemented rather than passed so the gate cannot be mistaken for satisfied.',
          severity: 'warning',
        }],
      });
      continue;
    }

    let outcome: ReleaseCheckOutcome;
    try {
      outcome = await definition.run(context);
    } catch (error) {
      outcome = {
        ok: false,
        diagnostics: [{
          code: 'KB_RELEASE_CHECK_THREW',
          message: `Check ${definition.id} threw: ${(error as Error).message}`,
          severity: 'error',
        }],
      };
    }

    const endedAt = now();
    const excepted = outcome.ok
      ? undefined
      : coveringException(exceptions, definition.id, context.candidateId, endedAt);

    records.push({
      id: definition.id,
      stage: definition.stage,
      required: definition.required,
      status: outcome.ok ? 'passed' : (excepted ? 'excepted' : 'failed'),
      startedAt,
      endedAt,
      evidenceRef: outcome.evidenceRef ?? null,
      diagnostics: excepted
        ? [...outcome.diagnostics, {
          code: 'KB_RELEASE_CHECK_EXCEPTED',
          message:
            `Waived by exception ${excepted.exceptionId} (${excepted.operator}): ${excepted.reason}. ` +
            'This candidate can never be promoted to stable.',
          severity: 'warning' as const,
        }]
        : outcome.diagnostics,
    });
  }

  return buildCheckReport(context, records, now());
}

/**
 * A gate is blocked by any required check that is not `passed` or `excepted`.
 *
 * `not-implemented` blocks on purpose. The alternative — treating an undeclared
 * executor as a pass — would mean shipping PR 4 with the delivery gates
 * silently open, which is the exact failure mode the stub statuses exist to
 * prevent.
 */
export function blockedGates(
  records: readonly ReleaseCheckRecord[],
  definitions: readonly ReleaseCheckDefinition[] = RELEASE_CHECK_GROUPS,
): ReleaseCheckGate[] {
  const gateById = new Map(definitions.map(definition => [definition.id, definition.gate]));
  const blocked = new Set<ReleaseCheckGate>();
  for (const record of records) {
    if (!record.required) { continue; }
    if (record.status === 'passed' || record.status === 'excepted') { continue; }
    const gate = gateById.get(record.id);
    if (gate) { blocked.add(gate); }
  }
  return [...blocked];
}

export function buildCheckReport(
  context: ReleaseCheckContext,
  records: readonly ReleaseCheckRecord[],
  generatedAt: string,
  definitions: readonly ReleaseCheckDefinition[] = RELEASE_CHECK_GROUPS,
): ReleaseCheckReport {
  const gates = blockedGates(records, definitions);
  return ReleaseCheckReportSchema.parse({
    schema: 'kb.release-check-report/1',
    flow: context.flow,
    channel: context.channel,
    candidateId: context.candidateId,
    ok: gates.length === 0,
    blockedGates: gates,
    checks: records,
    generatedAt,
    signature: null,
  });
}

/** Diagnostic emitted when a required check blocks a gate; used by callers that fail hard. */
export function requiredCheckFailure(report: ReleaseCheckReport): ReleaseCheckDiagnostic | null {
  if (report.ok) { return null; }
  const failed = report.checks
    .filter(check => check.required && check.status !== 'passed' && check.status !== 'excepted')
    .map(check => `${check.id} (${check.status})`);
  return {
    code: ReleaseControlDiagnosticCode.RequiredCheckFailed,
    message: `Required checks did not pass: ${failed.join(', ')}. Blocked gates: ${report.blockedGates.join(', ')}.`,
    severity: 'error',
  };
}
