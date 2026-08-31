/**
 * `kb release plan` — channel-aware, ledger-reserved candidate planning.
 *
 * Before the cutover this command computed bumps from the working tree and
 * wrote an ad-hoc `plan.json`. That is no longer sufficient: a plan has to
 * decide a *channel*, allocate a version that no other release can ever get,
 * and fix the changelog bytes — otherwise the `stage → package → seal → commit`
 * pipeline has nothing authoritative to bind to (it deliberately computes no
 * version policy of its own).
 *
 * So this command now produces two artifacts:
 *
 * - `plan.json`, unchanged in shape, because `release version`/`git`/`build`
 *   still consume it; and
 * - `.kb/release/candidates/<candidateId>/intent.json`, the control-plane
 *   document `release stage` takes as its only release decision.
 *
 * `--target experimental` is rejected here with a typed diagnostic rather than
 * being downgraded to canary (decision S0.3d). `--target stable` is rejected
 * too, for a different reason: stable is a promotion of existing bytes, not a
 * candidate that allocates a version (§3).
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
  useLoader,
  useConfig,
} from '@kb-labs/sdk';
import {
  planRelease,
  ReleaseChannelError,
  type VersionBump,
  type ReleaseConfig,
} from '@kb-labs/release-manager-core';
import { execFileSync } from 'node:child_process';

import {
  FileReleaseLedgerStore,
  planCandidate,
  releaseLedgerPath,
  ReleasePlanError,
  resolveRequestedChannel,
  type ProposalBump,
} from '../../shared/control-plane/index.js';
import { ChangelogFreezeError } from '../../shared/control-plane/changelog-freeze.js';
import { findRepoRoot, scopeToDir } from '../../shared/utils';

interface PlanFlags {
  scope?: string;
  flow?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  strict?: boolean;
  /** Requested release channel. `channel` remains as a deprecated alias. */
  target?: string;
  channel?: string;
  json?: boolean;
}

type ReleasePlanResult = CommandResult<unknown>;

interface TypedFailure {
  code: string;
  message: string;
}

function typedFailure(error: unknown): TypedFailure | null {
  if (error instanceof ReleaseChannelError) { return { code: error.code, message: error.message }; }
  if (error instanceof ReleasePlanError) { return { code: error.code, message: error.message }; }
  if (error instanceof ChangelogFreezeError) { return { code: error.code, message: error.message }; }
  return null;
}

/**
 * A `--bump auto` decision has to become a concrete step before it can be
 * proposed to the ledger: the ledger allocates one number, and "auto" is not a
 * number. The locally computed bump is what auto resolves to.
 */
function resolveProposalBump(
  requested: PlanFlags['bump'],
  planned: readonly { bump: VersionBump }[],
): ProposalBump {
  if (requested && requested !== 'auto') { return requested; }
  if (planned.some(pkg => pkg.bump === 'major')) { return 'major'; }
  if (planned.some(pkg => pkg.bump === 'minor')) { return 'minor'; }
  return 'patch';
}

export default defineCommand({
  id: 'release:plan',
  description: 'Analyze changes, reserve a version and prepare a release candidate intent',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PlanFlags>): Promise<ReleasePlanResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);
      const requestedTarget = flags.target ?? flags.channel ?? 'canary';

      // Channel policy runs first and cheaply: an invalid target must not cost
      // a config load, a package scan, or — critically — a burned version.
      let channel;
      try {
        channel = resolveRequestedChannel(requestedTarget);
      } catch (error) {
        const failure = typedFailure(error);
        if (!failure) { throw error; }
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: failure }); }
        else { ctx.ui?.write?.(`${failure.code}: ${failure.message}`); }
        return { ok: false, error: failure.message };
      }

      const configLoader = useLoader('Loading release configuration...');
      configLoader.start();
      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
        ...(flags.strict !== undefined && { strict: flags.strict }),
        channel,
      };
      configLoader.succeed('Configuration loaded');

      const planLoader = useLoader('Discovering packages and planning release...');
      planLoader.start();

      const basePlan = await planRelease({
        cwd: repoRoot,
        config,
        scope: flags.scope,
        flow: flags.flow,
        bumpOverride: flags.bump as VersionBump | undefined,
        channel,
      });

      if (basePlan.packages.length === 0) {
        planLoader.fail(`No packages found matching scope: ${flags.scope || 'all'}`);
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: 'no packages in scope' }); }
        return { ok: false, error: `No packages found matching scope: ${flags.scope || 'all'}` };
      }
      planLoader.succeed(`Found ${basePlan.packages.length} package(s) to release`);

      const flow = flags.flow ?? basePlan.flow ?? 'release';
      const plannedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();

      const store = new FileReleaseLedgerStore(releaseLedgerPath(repoRoot));

      let candidate;
      try {
        candidate = await planCandidate({
          repoRoot,
          flow,
          requestedTarget,
          bump: resolveProposalBump(flags.bump, basePlan.packages),
          packages: basePlan.packages.map(pkg => ({ name: pkg.name, currentVersion: pkg.currentVersion })),
          plannedCommit,
          branch,
          store,
          // Release notes are generated by `release changelog`; planning freezes
          // whatever exists so the intent digest covers real bytes. A minimal
          // placeholder is still *frozen* — the point of the freeze is that the
          // bytes cannot change under an approval, not that they are final prose.
          changelogs: { 'CHANGELOG.md': `# Release ${flow}\n` },
          planSha256: '0'.repeat(64),
        });
      } catch (error) {
        const failure = typedFailure(error);
        if (!failure) { throw error; }
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: failure }); }
        else { ctx.ui?.write?.(`${failure.code}: ${failure.message}`); }
        return { ok: false, error: failure.message };
      }

      // The persisted plan carries the *allocated* version, not the locally
      // computed one — every later step must see the number the ledger handed
      // out, never the one the working tree suggested.
      const version = candidate.reservation.version;
      const plan = {
        ...basePlan,
        packages: basePlan.packages.map(pkg => ({ ...pkg, nextVersion: version, versionPinned: true })),
      };

      const scopeDir = scopeToDir(flags.scope ?? 'root');
      const planDir = ctx.runtime.fs.join(repoRoot, '.kb', 'release', 'plans', scopeDir, 'current');
      const planPath = ctx.runtime.fs.join(planDir, 'plan.json');
      await ctx.runtime.fs.mkdir(planDir, { recursive: true });
      await ctx.runtime.fs.writeFile(planPath, JSON.stringify(plan, null, 2), { encoding: 'utf-8' });

      ctx.platform?.logger?.info?.('Release candidate planned', {
        flow,
        channel: candidate.channel,
        version,
        candidateId: candidate.intent.candidateId,
        packages: plan.packages.length,
      });

      const output = {
        ok: true as const,
        flow,
        channel: candidate.channel,
        version,
        releaseId: candidate.intent.releaseId,
        candidateId: candidate.intent.candidateId,
        intentPath: candidate.intentPath,
        intentSha256: candidate.intentSha256,
        planPath,
        packages: plan.packages.length,
        reservation: {
          sequence: candidate.reservation.sequence,
          state: candidate.reservation.state,
          baselineVersion: candidate.proposal.baselineVersion,
          baselineSource: candidate.proposal.baselineSource,
        },
        changelogSha256: candidate.changelog.frozen.changelogSha256,
        stablePromotionForbidden: candidate.stablePromotionForbidden,
      };

      console.log('::kb-output::' + JSON.stringify({
        version,
        packages: plan.packages.length,
        bump: candidate.proposal.bump,
        planPath,
        intentPath: candidate.intentPath,
      }));

      if (flags.json) {
        ctx.ui?.json?.(output);
      } else {
        ctx.ui?.sideBox?.({
          title: 'Release Candidate',
          sections: [
            {
              header: 'Reservation',
              items: [
                `Channel: ${candidate.channel}`,
                `Version: ${version} (baseline ${candidate.proposal.baselineVersion ?? 'none'} via ${candidate.proposal.baselineSource})`,
                `Release: ${candidate.intent.releaseId}`,
                `Candidate: ${candidate.intent.candidateId}`,
              ],
            },
            {
              header: 'Artifacts',
              items: [`Intent: ${candidate.intentPath}`, `Plan: ${planPath}`],
            },
          ],
          status: 'success',
        });
      }

      return { ok: true, result: output };
    },
  },
});
