/**
 * Unified release pipeline — single orchestrator for CLI and REST.
 *
 * Flow: plan → snapshot → checks → build → verify → version bump → changelog → publish → git → report
 *
 * IMPORTANT — publish BEFORE git:
 *   We commit and tag AFTER a successful publish, not before.
 *   This prevents the "git tag exists but npm is empty" state that breaks installs.
 *   If publish fails (even partially), no git commit or tag is created.
 */

import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { useEnv } from '@kb-labs/sdk';
import { planRelease } from './planner';
import { saveSnapshot, restoreSnapshot } from './rollback';
import { updatePackageVersions } from './publisher';
import { copyChangelogToPackages, commitAndTagRelease } from './publisher';
import { buildPackages } from './build';
import { runReleaseChecks } from './checks';
import { verifyPackages } from './verifier';
import { acquireLock } from './lock';
import {
  loadCheckpoint,
  writeCheckpoint,
  deleteCheckpoint,
  isCheckpointResumable,
} from './checkpoint';
import type {
  PipelineOptions,
  PipelineResult,
  ReleaseReport,
  ReleaseStage,
  VersionBump,
} from './types';

/**
 * Run the complete release pipeline.
 * Both CLI and REST call this with different injected publishers/changelog generators.
 */
export async function runReleasePipeline(options: PipelineOptions): Promise<PipelineResult> {
  const {
    cwd: _cwd, repoRoot, scopeCwd, scope, config, dryRun = false,
    skipChecks = false, skipBuild = false, skipVerify = false,
    noVerify = false,
    checks: checkConfigs, publisher, changelog: changelogGen,
    logger, onProgress,
  } = options;

  const flow = options.flow;

  const startTime = Date.now();
  const progress = (stage: ReleaseStage, msg: string) => {
    logger?.info?.(msg);
    onProgress?.(stage, msg);
  };

  // 0a. Acquire exclusive lock — prevents concurrent release runs.
  const releaseLock = acquireLock(repoRoot, flow);

  try {
  return await _runPipeline({
    repoRoot, scopeCwd, scope, flow, config, dryRun, skipChecks, skipBuild, skipVerify,
    noVerify, checkConfigs, publisher, changelogGen, logger, startTime, progress,
    options,
  });
  } finally {
    releaseLock();
  }
}

async function _runPipeline(ctx: {
  repoRoot: string;
  scopeCwd: string;
  scope: string | undefined;
  flow: string | undefined;
  config: PipelineOptions['config'];
  dryRun: boolean;
  skipChecks: boolean;
  skipBuild: boolean;
  skipVerify: boolean;
  noVerify: boolean;
  checkConfigs: PipelineOptions['checks'];
  publisher: PipelineOptions['publisher'];
  changelogGen: PipelineOptions['changelog'];
  logger: PipelineOptions['logger'];
  startTime: number;
  progress: (stage: ReleaseStage, msg: string) => void;
  options: PipelineOptions;
}): Promise<PipelineResult> {
  const {
    repoRoot, scopeCwd, scope, flow, config, dryRun,
    skipChecks, skipBuild, skipVerify, noVerify,
    checkConfigs, publisher, changelogGen, logger, startTime, progress,
  } = ctx;

  // 0b. Pre-flight: verify npm credentials before doing any real work.
  if (!dryRun) {
    const registry = config.registry ?? 'https://registry.npmjs.org';
    const authError = await verifyNpmAuth(registry);
    if (authError) {
      return {
        success: false,
        plan: { packages: [], strategy: 'semver', registry, rollbackEnabled: false },
        report: buildReport('planning', { packages: [], strategy: 'semver', registry, rollbackEnabled: false }, repoRoot, dryRun, startTime, {
          ok: false,
          errors: [`npm auth check failed: ${authError}`],
          timingMs: Date.now() - startTime,
        }),
      };
    }
  }

  // 1. Plan — always discover from repoRoot with scope as a filter.
  // scopeCwd is used only for checks/git/changelog (physical path ops), not for discovery.
  progress('planning', 'Discovering packages and planning release...');
  const plan = await planRelease({
    cwd: repoRoot,
    config,
    scope,
    flow,                                     // already includes defaultFlow fallback
    bumpOverride: config.bump as VersionBump | undefined,
  });

  if (plan.packages.length === 0) {
    return {
      success: false,
      plan,
      report: buildReport('planning', plan, repoRoot, dryRun, startTime, {
        ok: false, errors: [`No packages found for scope: ${scope || 'all'}`], timingMs: 0,
      }),
    };
  }

  progress('planning', `Found ${plan.packages.length} package(s) to release`);

  // 1b. Check for resumable checkpoint — publish already done, only git remains.
  if (!dryRun) {
    const existingCheckpoint = loadCheckpoint(repoRoot);
    if (existingCheckpoint) {
      const uniqueVersions = new Set(plan.packages.map(p => p.nextVersion));
      const planVersion = uniqueVersions.size === 1 ? plan.packages[0]!.nextVersion : 'independent';
      if (isCheckpointResumable(existingCheckpoint, flow ?? 'default', planVersion)) {
        progress('publishing', 'Resuming from checkpoint — publish already done, running git step...');
        const resumeGit = await commitAndTagRelease({
          cwd: scopeCwd,
          plan,
          dryRun: false,
          noVerify,
          repoRoot,
          checkpointGitRoots: existingCheckpoint.gitRoots,
        });
        deleteCheckpoint(repoRoot);
        const resumeReport = buildReport('verifying', plan, repoRoot, dryRun, startTime, {
          ok: resumeGit.committed,
          published: existingCheckpoint.publishedPackages.map(p => `${p.name}@${p.version}`),
          git: resumeGit,
          timingMs: Date.now() - startTime,
        });
        const scopeDir = scope ? scope.replace(/[@/]/g, '-').replace(/^-/, '') : 'root';
        const historyDir = join(repoRoot, '.kb', 'release', 'history', scopeDir, new Date().toISOString().replace(/[:.]/g, '-'));
        await mkdir(historyDir, { recursive: true });
        await writeFile(join(historyDir, 'report.json'), JSON.stringify(resumeReport, null, 2), 'utf-8');
        return { success: resumeReport.result.ok, plan, report: resumeReport };
      }
    }
  }

  // 2. Snapshot (for rollback)
  await saveSnapshot({ cwd: repoRoot, plan });

  // 3. Checks
  if (!skipChecks && checkConfigs && checkConfigs.length > 0) {
    progress('checking', `Running ${checkConfigs.length} pre-release check(s)...`);

    const packagePaths = plan.packages.map(p => p.path);
    const checkResults = await runReleaseChecks(checkConfigs, {
      repoRoot,
      packagePaths,
      scopePath: scopeCwd,
      logger,
    });

    const failed = checkResults.filter(r => !r.ok && r.hint !== 'optional');
    if (failed.length > 0) {
      await restoreSnapshot(repoRoot);

      // Build rich per-check error messages for both human and agent consumption
      const errorLines = failed.flatMap(f => {
        const lines: string[] = [`check "${f.id}" failed`];
        if (f.details?.packagePath) { lines.push(`  package: ${f.details.packagePath}`); }
        if (f.details?.error) { lines.push(`  reason: ${f.details.error}`); }
        if (f.details?.stderr?.trim()) { lines.push(`  stderr: ${f.details.stderr.trim().split('\n').slice(0, 5).join('\n          ')}`); }
        if (f.details?.stdout?.trim() && !f.details?.stderr?.trim()) { lines.push(`  output: ${f.details.stdout.trim().split('\n').slice(0, 5).join('\n          ')}`); }
        if (f.packages?.filter(p => !p.ok).length) {
          const failedPkgs = f.packages.filter(p => !p.ok);
          lines.push(`  failed in ${failedPkgs.length}/${f.packages.length} package(s):`);
          for (const pkg of failedPkgs.slice(0, 10)) {
            lines.push(`    - ${pkg.path}${pkg.details?.error ? `: ${pkg.details.error}` : ''}`);
          }
        }
        return lines;
      });

      return {
        success: false,
        plan,
        report: buildReport('checking', plan, repoRoot, dryRun, startTime, {
          ok: false,
          checks: Object.fromEntries(checkResults.map(r => [r.id, r])),
          errors: errorLines,
          timingMs: Date.now() - startTime,
        }),
      };
    }

    progress('checking', 'Pre-release checks passed');
  }

  // 4. Build
  if (!skipBuild && !dryRun) {
    progress('versioning', `Building ${plan.packages.length} package(s)...`);
    const buildResults = await buildPackages(plan.packages, { logger });
    const buildFailed = buildResults.filter(r => !r.success);

    if (buildFailed.length > 0) {
      await restoreSnapshot(repoRoot);
      return {
        success: false,
        plan,
        report: buildReport('versioning', plan, repoRoot, dryRun, startTime, {
          ok: false,
          errors: buildFailed.map(f => `Build failed: ${f.name} — ${f.error}`),
          timingMs: Date.now() - startTime,
        }),
      };
    }
  }

  // 5. Verify (pack + install check)
  if (!skipVerify && !dryRun) {
    progress('verifying', 'Verifying package artifacts...');
    const verifyResults = await verifyPackages(plan.packages, { logger });
    const verifyFailed = verifyResults.filter(r => !r.success);

    if (verifyFailed.length > 0) {
      await restoreSnapshot(repoRoot);
      const allIssues = verifyFailed.flatMap(r => r.issues.map(i => `${r.name}: ${i}`));
      return {
        success: false,
        plan,
        report: buildReport('verifying', plan, repoRoot, dryRun, startTime, {
          ok: false,
          errors: [`Package verification failed:\n  ${allIssues.join('\n  ')}`],
          timingMs: Date.now() - startTime,
        }),
      };
    }

    progress('verifying', 'Package artifacts verified');
  }

  // 6. Version bump
  progress('versioning', 'Updating package versions...');
  if (!dryRun) {
    const versionUpdates = await updatePackageVersions(plan);
    const failedUpdates = versionUpdates.filter(u => !u.updated);
    if (failedUpdates.length > 0) {
      await restoreSnapshot(repoRoot);
      return {
        success: false,
        plan,
        report: buildReport('versioning', plan, repoRoot, dryRun, startTime, {
          ok: false,
          errors: failedUpdates.map(u => `Version update failed: ${u.package}`),
          versionUpdates,
          timingMs: Date.now() - startTime,
        }),
      };
    }
  }

  // 7. Changelog
  let changelogMd = '';
  if (changelogGen) {
    progress('versioning', 'Generating changelog...');
    try {
      changelogMd = await changelogGen.generate(plan, { repoRoot, gitCwd: scopeCwd, config });
    } catch (err) {
      logger?.warn?.(`Changelog generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (changelogMd && !dryRun) {
    await copyChangelogToPackages({ cwd: repoRoot, plan, changelog: changelogMd });
    const changelogPath = join(repoRoot, '.kb', 'release', 'CHANGELOG.md');
    await mkdir(join(repoRoot, '.kb', 'release'), { recursive: true });
    await writeFile(changelogPath, changelogMd, 'utf-8');
  }

  // 8. Publish (before git — see module comment)
  progress('publishing', dryRun ? 'Simulating publish (dry-run)...' : 'Publishing packages...');
  const packagesToPublish = plan.packages.map(pkg => ({
    name: pkg.name,
    version: pkg.nextVersion,
    path: pkg.path,
  }));

  const publishResult = await publisher.publish(packagesToPublish, {
    dryRun,
    access: 'public',
  });

  // If any package genuinely failed to publish, abort before touching git.
  // "alreadyPublished" entries are fine — they are counted as success.
  const publishFailed = publishResult.failed.length > 0;

  if (publishFailed) {
    return {
      success: false,
      plan,
      report: buildReport('publishing', plan, repoRoot, dryRun, startTime, {
        ok: false,
        published: publishResult.published,
        skipped: publishResult.skipped,
        errors: [
          `${publishResult.failed.length} package(s) failed to publish — git commit/tag skipped to prevent desync.`,
          ...(publishResult.errors ?? []),
        ],
        timingMs: Date.now() - startTime,
      }),
    };
  }

  // 8b. Write checkpoint after successful publish — enables git-only retry on failure.
  if (!dryRun) {
    const uniqueVersions = new Set(plan.packages.map(p => p.nextVersion));
    const cpVersion = uniqueVersions.size === 1 ? plan.packages[0]!.nextVersion : 'independent';
    writeCheckpoint(repoRoot, {
      flow: flow ?? 'default',
      version: cpVersion,
      publishedPackages: plan.packages.map(p => ({
        name: p.name,
        version: p.nextVersion,
        path: p.path,
        gitRoot: p.gitRoot,
      })),
      gitRoots: {},
    });
  }

  // 9. Git commit + tag — only after all packages are on npm
  let gitResult: { committed: boolean; tagged: string[]; pushed: boolean } | undefined;
  if (!dryRun) {
    progress('verifying', 'Committing and tagging release...');
    gitResult = await commitAndTagRelease({ cwd: scopeCwd, plan, dryRun, noVerify, repoRoot });
    deleteCheckpoint(repoRoot);
  }

  // 10. Report
  const report = buildReport('verifying', plan, repoRoot, dryRun, startTime, {
    ok: (!gitResult || gitResult.committed),
    published: publishResult.published,
    alreadyPublished: publishResult.alreadyPublished,
    skipped: publishResult.skipped,
    changelog: changelogMd || undefined,
    git: gitResult,
    timingMs: Date.now() - startTime,
  });

  // Save report
  const scopeDir = scope ? scope.replace(/[@/]/g, '-').replace(/^-/, '') : 'root';
  const historyDir = join(repoRoot, '.kb', 'release', 'history', scopeDir, new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(historyDir, { recursive: true });
  await writeFile(join(historyDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');

  return { success: report.result.ok, plan, report };
}

/**
 * Quick pre-flight check: verify npm credentials are valid.
 * Uses the registry HTTP API directly — works regardless of .npmrc config.
 * Returns an error string on failure, null on success.
 */
async function verifyNpmAuth(registry: string): Promise<string | null> {
  const token = useEnv('NPM_TOKEN') ?? useEnv('NODE_AUTH_TOKEN');
  if (!token) {
    return 'NPM_TOKEN or NODE_AUTH_TOKEN environment variable is not set';
  }
  try {
    const res = await fetch(`${registry}/-/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return `npm token invalid or expired (HTTP ${res.status} from ${registry})`;
    }
    return null;
  } catch (e) {
    return `npm registry unreachable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function buildReport(
  stage: ReleaseStage,
  plan: any,
  repoRoot: string,
  dryRun: boolean,
  startTime: number,
  result: any,
): ReleaseReport {
  return {
    schemaVersion: '1.0',
    ts: new Date().toISOString(),
    context: { repo: repoRoot, cwd: repoRoot, branch: 'unknown', dryRun },
    stage,
    plan,
    result: { ...result, timingMs: result.timingMs ?? (Date.now() - startTime) },
  };
}
