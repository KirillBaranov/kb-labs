/**
 * The candidate build pipeline, as the state machine sees it.
 *
 * PR 3 and PR 4 already own the mechanics — `planCandidate`, `stageRelease`,
 * `packageStagedBundle`, `sealBundle`, `verifyBundleDirectory`,
 * `commitSealedBundle`, `runStagedChecks`. This module does not reimplement any
 * of them; `createRepoCandidatePipeline` is a thin call-through.
 *
 * The interface exists for one reason: the saga must be testable at every state,
 * including the states after a simulated crash, and `stage`/`package` need a git
 * worktree and a package manager to reach those states honestly. Putting the
 * seam here means the *orchestration order* — which is what PR 5 is responsible
 * for — is verified independently of whether `pnpm pack` is available. Every
 * ordering rule the tests assert (nothing rebuilds after `bundled`, the release
 * map is rendered over sealed bytes, approval precedes `commit`) is enforced by
 * the saga, not by the implementation behind this interface, so a fake cannot
 * make a broken order pass.
 *
 * `dryRun` uses the simulated implementation for the same reason: a dry run that
 * really staged and packed would not be dry, and one that skipped the pipeline
 * entirely would not exercise the state machine, which is the only part worth
 * dry-running.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ReleaseBundleSchema,
  canonicalSha256,
  type ReleaseCheckReport,
  type ReleaseControlChannel,
} from '@kb-labs/release-manager-contracts';

import { discardStaging, stageRelease } from '../bundle/stage.js';
import { packageStagedBundle, type BinarySource, type PackageTarballer } from '../bundle/package.js';
import { sealBundle, type ReleaseIndexSealer } from '../bundle/seal.js';
import { commitSealedBundle } from '../bundle/commit.js';
import type { CandidateReleaseIntent } from '../bundle/intent.js';
import { verifyBundleDirectory } from '../verify-bundle.js';
import { readStageState } from '../bundle/stage-state.js';
import { intentSha256 } from '../bundle/intent.js';
import { CandidateReleaseIntentSchema } from '@kb-labs/release-manager-contracts';
import { frozenChangelogEntries, readFrozenChangelog } from './changelog-freeze.js';
import { readExceptions } from './exception.js';
import { runStagedChecks } from './checks.js';
import { intentPathFor, planCandidate, type PlanCandidateInput } from './plan.js';
import type { ReceiptEvidenceReference } from './receipt.js';

export interface PipelinePlanResult {
  releaseId: string;
  candidateId: string;
  channel: ReleaseControlChannel;
  version: string;
  intent: CandidateReleaseIntent;
  intentSha256: string;
  /** Frozen changelog bytes, keyed by worktree-relative path. */
  changelogs: Record<string, string>;
  stablePromotionForbidden: boolean;
}

export interface PipelineCheckResult {
  ok: boolean;
  report: ReleaseCheckReport;
  evidence: ReceiptEvidenceReference;
}

export interface PipelineSealResult {
  bundleDir: string;
  bundleSha256: string;
  indexSha256: string;
  treeSha256: string;
}

export interface PipelineCommitResult {
  releaseCommit: string;
  treeSha256: string;
  tag: string | null;
}

/**
 * The release map (cutover §6A.4 step 4, execution PR 5 item 3).
 *
 * Rendered over the *sealed* bundle and carrying `bundleSha256`, the artifact
 * inventory, the index digest and the artifact checks — so the operator approves
 * what exists rather than what was planned.
 */
export interface ReleaseMap {
  bundleSha256: string;
  indexSha256: string;
  releaseId: string;
  candidateId: string;
  requestedTarget: ReleaseControlChannel;
  artifacts: readonly { path: string; sha256: string; size: number }[];
  checks: readonly { id: string; status: string; required: boolean }[];
  mapSha256: string;
}

export interface CandidatePipeline {
  plan(): Promise<PipelinePlanResult>;
  /**
   * Rebuilds the plan result for an existing candidate **without reserving
   * anything**.
   *
   * A resumed process at `source-checked` or `staged` still needs the intent and
   * the frozen changelog to finish staging, but re-running `plan` would allocate
   * a second version for one release — the exact thing the ledger exists to make
   * impossible. So resume reads back what `plan` already wrote instead.
   */
  rehydrate(candidateId: string): Promise<PipelinePlanResult>;
  sourceChecks(input: { plan: PipelinePlanResult }): Promise<PipelineCheckResult>;
  stage(input: { plan: PipelinePlanResult }): Promise<{ treeSha256: string }>;
  package(input: { plan: PipelinePlanResult }): Promise<{ bundleDir: string }>;
  seal(input: { plan: PipelinePlanResult; bundleDir: string }): Promise<PipelineSealResult>;
  verifyBundle(input: { plan: PipelinePlanResult; bundleDir: string; bundleSha256: string }): Promise<PipelineCheckResult>;
  renderReleaseMap(input: { plan: PipelinePlanResult; seal: PipelineSealResult; checks: ReleaseCheckReport | null }): Promise<ReleaseMap>;
  /**
   * Takes bare identity rather than the plan result on purpose: everything from
   * `approved` onwards must be reachable on a resumed process that is forbidden
   * to re-run `plan`, and a plan-shaped argument would quietly require it.
   */
  commit(input: { candidateId: string; bundleDir: string }): Promise<PipelineCommitResult>;
  /** Destroys the disposable worktree — §3.4 consequence 1, on cancel or reject. */
  discard(input: { candidateId: string }): Promise<void>;
}

/**
 * Digests the release map so the approval can name it.
 *
 * `mapSha256` is derived from the map's own content and never supplied, so a
 * map cannot claim a digest it does not have.
 */
export function buildReleaseMap(base: Omit<ReleaseMap, 'mapSha256'>): ReleaseMap {
  const normalized: Omit<ReleaseMap, 'mapSha256'> = {
    ...base,
    artifacts: base.artifacts.map(file => ({ path: file.path, sha256: file.sha256, size: file.size })),
    checks: base.checks.map(check => ({ id: check.id, status: check.status, required: check.required })),
  };
  return { ...normalized, mapSha256: canonicalSha256(normalized) };
}

export interface RepoCandidatePipelineOptions {
  /** Everything `planCandidate` needs; passed straight through. */
  plan: PlanCandidateInput;
  bundleDir: string;
  /** Index channel label; the channel *policy* is decided by `plan`. */
  registry?: string;
  tarballer?: PackageTarballer;
  indexSealer?: ReleaseIndexSealer;
  binaries?: BinarySource;
  tag?: string;
  sealedAt?: string;
  now?: () => string;
}

/**
 * The real pipeline: PR 3/PR 4 functions, called as a library.
 *
 * Nothing here decides anything. Ordering, approval and failure classification
 * belong to the saga; this object only knows how to perform one step when asked.
 */
export function createRepoCandidatePipeline(options: RepoCandidatePipelineOptions): CandidatePipeline {
  return {
    async plan(): Promise<PipelinePlanResult> {
      const result = await planCandidate(options.plan);
      return {
        releaseId: result.intent.releaseId,
        candidateId: result.intent.candidateId,
        channel: result.channel,
        version: result.reservation.version,
        intent: result.intent,
        intentSha256: result.intentSha256,
        changelogs: Object.fromEntries(
          result.changelog.frozen.entries.map(entry => [entry.path, entry.content]),
        ),
        stablePromotionForbidden: result.stablePromotionForbidden,
      };
    },

    async rehydrate(candidateId): Promise<PipelinePlanResult> {
      const intent = CandidateReleaseIntentSchema.parse(
        JSON.parse(readFileSync(intentPathFor(options.plan.repoRoot, candidateId), 'utf8')) as unknown,
      ) as CandidateReleaseIntent;
      const frozen = readFrozenChangelog(options.plan.repoRoot, candidateId);
      return {
        releaseId: intent.releaseId,
        candidateId: intent.candidateId,
        channel: 'canary',
        version: intent.packageSet[0]!.version,
        intent,
        intentSha256: intentSha256(intent),
        changelogs: frozen ? frozenChangelogEntries(frozen) : {},
        stablePromotionForbidden: readExceptions(options.plan.repoRoot, candidateId).length > 0,
      };
    },

    async sourceChecks({ plan }): Promise<PipelineCheckResult> {
      const report = await runStagedChecks({
        context: {
          repoRoot: options.plan.repoRoot,
          flow: plan.intent.flow,
          channel: plan.channel,
          candidateId: plan.candidateId,
        },
        stages: ['source'],
        ...(options.now ? { now: options.now } : {}),
      });
      return {
        ok: report.ok,
        report,
        evidence: { id: `source-checks:${plan.candidateId}`, kind: 'release-check-report' },
      };
    },

    async stage({ plan }) {
      const result = stageRelease({
        repoRoot: options.plan.repoRoot,
        intent: plan.intent,
        intentSha256: plan.intentSha256,
        changelogs: plan.changelogs,
      });
      return { treeSha256: result.state.treeSha256 };
    },

    async package({ plan }) {
      packageStagedBundle({
        intent: plan.intent,
        intentSha256: plan.intentSha256,
        state: readStageState(options.plan.repoRoot, plan.candidateId),
        outDir: options.bundleDir,
        ...(options.tarballer ? { tarballer: options.tarballer } : {}),
        ...(options.binaries ? { binaries: options.binaries } : {}),
      });
      return { bundleDir: options.bundleDir };
    },

    async seal({ plan, bundleDir }) {
      const sealed = sealBundle({
        bundleDir,
        channel: plan.channel,
        ...(options.registry ? { registry: options.registry } : {}),
        ...(options.indexSealer ? { indexSealer: options.indexSealer } : {}),
        ...(options.sealedAt ? { sealedAt: options.sealedAt } : {}),
      });
      return {
        bundleDir,
        bundleSha256: sealed.bundle.bundleSha256,
        indexSha256: sealed.bundle.indexSha256,
        treeSha256: sealed.bundle.treeSha256,
      };
    },

    async verifyBundle({ plan, bundleDir, bundleSha256 }): Promise<PipelineCheckResult> {
      const verification = verifyBundleDirectory(bundleDir, bundleSha256);
      const report = await runStagedChecks({
        context: {
          repoRoot: options.plan.repoRoot,
          flow: plan.intent.flow,
          channel: plan.channel,
          candidateId: plan.candidateId,
          bundleDir,
        },
        stages: ['artifact'],
        ...(options.now ? { now: options.now } : {}),
      });
      return {
        ok: verification.ok && report.ok,
        report,
        evidence: { id: `verify-bundle:${plan.candidateId}`, kind: 'bundle-verification', sha256: bundleSha256 },
      };
    },

    async renderReleaseMap({ plan, seal, checks }) {
      // Read the inventory back out of the sealed `bundle.json` rather than
      // from anything the pipeline remembers: the map has to describe the bytes
      // on disk, because those are the bytes the approval will cover.
      const manifest = ReleaseBundleSchema.parse(
        JSON.parse(readFileSync(resolve(seal.bundleDir, 'bundle.json'), 'utf8')) as unknown,
      );
      return buildReleaseMap({
        bundleSha256: seal.bundleSha256,
        indexSha256: seal.indexSha256,
        releaseId: plan.releaseId,
        candidateId: plan.candidateId,
        requestedTarget: plan.channel,
        artifacts: manifest.files,
        checks: checks?.checks ?? [],
      });
    },

    async commit({ candidateId, bundleDir }) {
      const result = commitSealedBundle({
        repoRoot: options.plan.repoRoot,
        bundleDir,
        ...(options.tag ? { tag: options.tag } : {}),
      });
      if (result.candidateId !== candidateId) {
        throw new Error(`commit produced candidate ${result.candidateId}, expected ${candidateId}`);
      }
      return { releaseCommit: result.releaseCommit, treeSha256: result.treeSha256, tag: result.tag };
    },

    async discard({ candidateId }) {
      discardStaging(options.plan.repoRoot, candidateId);
    },
  };
}
