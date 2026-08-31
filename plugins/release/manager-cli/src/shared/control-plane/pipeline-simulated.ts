/**
 * A `CandidatePipeline` that produces deterministic digests without touching
 * git, npm or the filesystem.
 *
 * Two callers, one reason. The saga tests need to reach `artifacts-published`
 * and beyond — and to reach them *again* after a simulated crash — which a real
 * `pnpm pack` per package makes prohibitively slow and machine-dependent. And
 * `--dry-run` needs to prove the state machine drives an operation to a terminal
 * state without publishing anything.
 *
 * What it must not do is make a wrong orchestration look right, so it records
 * every call: `calls` is what the resume tests assert against when they check
 * that `stage`/`package`/`seal` ran exactly once across a crash and a resume.
 */

import { createHash } from 'node:crypto';

import {
  ReleaseCheckReportSchema,
  type ReleaseCheckReport,
  type ReleaseControlChannel,
} from '@kb-labs/release-manager-contracts';

import {
  buildReleaseMap,
  type CandidatePipeline,
  type PipelineCheckResult,
  type PipelinePlanResult,
  type ReleaseMap,
} from './pipeline.js';
import { rejectingFailure, transientFailure } from './adapters.js';

function digest(...parts: string[]): string {
  return createHash('sha256').update(parts.join(' ')).digest('hex');
}

export type SimulatedPipelineStep =
  | 'plan'
  | 'source-checks'
  | 'stage'
  | 'package'
  | 'seal'
  | 'verify-bundle'
  | 'release-map'
  | 'commit'
  | 'discard';

export interface SimulatedPipelineOptions {
  flow?: string;
  version?: string;
  candidateId?: string;
  channel?: ReleaseControlChannel;
  /** Steps scripted to fail; `transient` never burns a version, `reject` does. */
  failures?: Partial<Record<SimulatedPipelineStep, 'transient' | 'reject' | 'crash'>>;
  /** Source or artifact checks that should report as failing. */
  failingChecks?: readonly SimulatedPipelineStep[];
}

export class SimulatedPipelineCrash extends Error {
  constructor(step: SimulatedPipelineStep) {
    super(`simulated crash during ${step}`);
    this.name = 'SimulatedPipelineCrash';
  }
}

function emptyReport(flow: string, candidateId: string, ok: boolean): ReleaseCheckReport {
  return ReleaseCheckReportSchema.parse({
    schema: 'kb.release-check-report/1',
    flow,
    candidateId,
    channel: 'canary',
    generatedAt: '2026-08-31T00:00:00Z',
    ok,
    checks: [],
    blockedGates: ok ? [] : ['approval'],
    signature: null,
  });
}

export class SimulatedCandidatePipeline implements CandidatePipeline {
  readonly calls: SimulatedPipelineStep[] = [];
  private readonly options: SimulatedPipelineOptions;
  private readonly flow: string;
  private readonly version: string;
  private readonly candidateId: string;

  constructor(options: SimulatedPipelineOptions = {}) {
    this.options = options;
    this.flow = options.flow ?? 'platform';
    this.version = options.version ?? '1.0.0';
    this.candidateId = options.candidateId ?? `${this.flow}-${this.version}-canary`;
  }

  countOf(step: SimulatedPipelineStep): number {
    return this.calls.filter(call => call === step).length;
  }

  private enter(step: SimulatedPipelineStep): void {
    this.calls.push(step);
    const failure = this.options.failures?.[step];
    if (failure === 'transient') { throw transientFailure(`${step} timed out`); }
    if (failure === 'reject') { throw rejectingFailure(`${step} failed`); }
    if (failure === 'crash') { throw new SimulatedPipelineCrash(step); }
  }

  private get releaseId(): string {
    return `${this.flow}-${this.version}`;
  }

  private get bundleSha256(): string {
    return digest('bundle', this.candidateId, this.version);
  }

  async plan(): Promise<PipelinePlanResult> {
    this.enter('plan');
    return this.planResult();
  }

  private planResult(): PipelinePlanResult {
    return {
      releaseId: this.releaseId,
      candidateId: this.candidateId,
      channel: this.options.channel ?? 'canary',
      version: this.version,
      // The saga only reads identity off the plan; a full intent document would
      // be inert here and would invite the fake to drift from the real schema.
      intent: {
        schema: 'kb.release-intent/1',
        operation: 'candidate',
        releaseId: this.releaseId,
        candidateId: this.candidateId,
        source: { plannedCommit: 'a'.repeat(40), branch: 'master' },
        flow: this.flow,
        requestedTarget: 'canary',
        planSha256: digest('plan', this.candidateId),
        mutationSha256: digest('mutation', this.candidateId),
        packageSet: [{ name: '@kb-labs/core-runtime', version: this.version }],
        signature: null,
      } as PipelinePlanResult['intent'],
      intentSha256: digest('intent', this.candidateId, this.version),
      changelogs: {},
      stablePromotionForbidden: false,
    };
  }

  /**
   * Deterministic by construction: the simulated plan is a pure function of the
   * candidate id, so rehydrating it cannot drift from what `plan` returned — and
   * crucially it does not record a `plan` call, which is what lets the resume
   * tests assert that `plan` ran exactly once.
   */
  async rehydrate(): Promise<PipelinePlanResult> {
    return this.planResult();
  }

  async sourceChecks({ plan }: { plan: PipelinePlanResult }): Promise<PipelineCheckResult> {
    this.enter('source-checks');
    const ok = !(this.options.failingChecks ?? []).includes('source-checks');
    return {
      ok,
      report: emptyReport(this.flow, plan.candidateId, ok),
      evidence: { id: `source-checks:${plan.candidateId}`, kind: 'release-check-report' },
    };
  }

  async stage({ plan }: { plan: PipelinePlanResult }): Promise<{ treeSha256: string }> {
    this.enter('stage');
    return { treeSha256: digest('tree', plan.candidateId) };
  }

  async package(): Promise<{ bundleDir: string }> {
    this.enter('package');
    return { bundleDir: `/simulated/${this.candidateId}` };
  }

  async seal({ plan, bundleDir }: { plan: PipelinePlanResult; bundleDir: string }) {
    this.enter('seal');
    return {
      bundleDir,
      bundleSha256: this.bundleSha256,
      indexSha256: digest('index', plan.candidateId),
      treeSha256: digest('tree', plan.candidateId),
    };
  }

  async verifyBundle({ plan, bundleSha256 }: { plan: PipelinePlanResult; bundleDir: string; bundleSha256: string }): Promise<PipelineCheckResult> {
    this.enter('verify-bundle');
    const ok = !(this.options.failingChecks ?? []).includes('verify-bundle');
    return {
      ok,
      report: emptyReport(this.flow, plan.candidateId, ok),
      evidence: { id: `verify-bundle:${plan.candidateId}`, kind: 'bundle-verification', sha256: bundleSha256 },
    };
  }

  async renderReleaseMap(input: {
    plan: PipelinePlanResult;
    seal: { bundleSha256: string; indexSha256: string };
    checks: ReleaseCheckReport | null;
  }): Promise<ReleaseMap> {
    this.enter('release-map');
    return buildReleaseMap({
      bundleSha256: input.seal.bundleSha256,
      indexSha256: input.seal.indexSha256,
      releaseId: input.plan.releaseId,
      candidateId: input.plan.candidateId,
      requestedTarget: input.plan.channel,
      artifacts: [{ path: 'bundle.json', sha256: input.seal.bundleSha256, size: 1 }],
      checks: input.checks?.checks ?? [],
    });
  }

  async commit({ candidateId }: { candidateId: string; bundleDir: string }) {
    this.enter('commit');
    return {
      releaseCommit: digest('commit', candidateId).slice(0, 40),
      treeSha256: digest('tree', candidateId),
      tag: `v${this.version}`,
    };
  }

  async discard(): Promise<void> {
    this.enter('discard');
  }
}
