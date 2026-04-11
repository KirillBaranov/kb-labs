/**
 * Unified release pipeline — single orchestrator for CLI and REST.
 *
 * Flow: plan → snapshot → checks → build → verify → version bump → changelog → publish → git → report
 */

import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { planRelease } from './planner';
import { saveSnapshot, restoreSnapshot } from './rollback';
import { updatePackageVersions } from './publisher';
import { copyChangelogToPackages, commitAndTagRelease } from './publisher';
import { buildPackages } from './build';
import { runReleaseChecks } from './checks';
import { verifyPackages } from './verifier';
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
    cwd, repoRoot, scopeCwd, scope, config, dryRun = false,
    skipChecks = false, skipBuild = false, skipVerify = false,
    noVerify = false,
    checks: checkConfigs, publisher, changelog: changelogGen,
    logger, onProgress,
  } = options;

  const startTime = Date.now();
  const progress = (stage: ReleaseStage, msg: string) => {
    logger?.info?.(msg);
    onProgress?.(stage, msg);
  };

  // 1. Plan — always discover from repoRoot with scope as a filter.
  // scopeCwd is used only for checks/git/changelog (physical path ops), not for discovery.
  progress('planning', 'Discovering packages and planning release...');
  const plan = await planRelease({
    cwd: repoRoot,
    config,
    scope,
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
      return {
        success: false,
        plan,
        report: buildReport('checking', plan, repoRoot, dryRun, startTime, {
          ok: false,
          checks: Object.fromEntries(checkResults.map(r => [r.id, r])),
          errors: [`Pre-release checks failed: ${failed.map(f => f.id).join(', ')}`],
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

  // 8. Publish
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

  // 9. Git commit + tag
  let gitResult: { committed: boolean; tagged: string[]; pushed: boolean } | undefined;
  if (!dryRun && publishResult.errors.length === 0) {
    progress('verifying', 'Committing and tagging release...');
    gitResult = await commitAndTagRelease({ cwd: scopeCwd, plan, dryRun, noVerify });
  }

  // 10. Report
  const report = buildReport('verifying', plan, repoRoot, dryRun, startTime, {
    ok: publishResult.errors.length === 0,
    published: publishResult.published,
    skipped: publishResult.skipped,
    changelog: changelogMd || undefined,
    git: gitResult ?? undefined,
    errors: publishResult.errors.length > 0 ? publishResult.errors : undefined,
    timingMs: Date.now() - startTime,
  });

  // Save report
  const scopeDir = scope ? scope.replace(/[@/]/g, '-').replace(/^-/, '') : 'root';
  const historyDir = join(repoRoot, '.kb', 'release', 'history', scopeDir, new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(historyDir, { recursive: true });
  await writeFile(join(historyDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');

  return { success: report.result.ok, plan, report };
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
