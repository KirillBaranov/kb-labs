/**
 * Standalone stage command — packs the flow's currently-committed package
 * versions into real npm tarballs, once, so every downstream `release
 * deliver` job ships the exact same bytes instead of re-packing
 * independently from source. See plugins/release/docs/adr/0001-* and the
 * "plugin prepares, CI delivers" release plan.
 *
 * Deliberately does NOT call planRelease() — same reasoning as promote.ts:
 * versions are already fixed by the prepare step that already ran (version
 * bump, changelog, git commit/tag/push). This command's only job is
 * "pack exactly what's already on disk, unchanged."
 *
 * Not to be confused with `release:pack` (`pack.ts`) — that command
 * verifies *proposed* packages via `npm pack` + static checks before a
 * release is decided; this one produces the *actual* tarball artifact for
 * an already-decided release.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig, useEnv, type CommandResult } from '@kb-labs/sdk';
import {
  discoverCurrentPackages,
  mergeConfigWithFlow,
  verifyExtractedTarball,
  verifyCleanInstall,
  type ReleaseConfig,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { rewriteWorkspaceDeps } from '../../shared/dep-rewrite';
import { resolveFlowName, type FlowResolvableFlags } from '../../shared/resolve-flow';

interface StageFlags extends FlowResolvableFlags {
  'out-dir'?: string;
  json?: boolean;
}

export interface StagedArtifact {
  name: string;
  version: string;
  tarball: string;
  sha256: string;
}

interface StagePayload {
  outDir?: string;
  artifacts?: StagedArtifact[];
}

/**
 * Pack one package into `outDir`, returning the produced tarball's filename.
 *
 * pnpm (the default, matches `check-pack-install.sh`'s own packing) resolves
 * `workspace:*`/`workspace:^`/`workspace:~` natively across every dependency
 * section — dependencies, peerDependencies, AND devDependencies — using the
 * live monorepo state on disk. No external versionMap or manual rewrite is
 * needed, and there is no dedicated --json output; `pnpm pack` just prints
 * the produced tarball's absolute path as its last stdout line.
 *
 * npm/yarn (opt-in via `config.publish.packageManager`) never resolves
 * workspace: protocols on their own, so those two still need the manual
 * rewriteWorkspaceDeps() pre-pass with a versionMap built from the whole
 * workspace (see caller).
 */
/** pnpm prints the produced tarball's absolute path as its last stdout line — no --json output exists. */
function filenameFromPnpmPack(stdout: string): string | undefined {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1];
  return lastLine ? basename(lastLine.trim()) : undefined;
}

/** `npm pack --json` prints a JSON array; we only ever pack one package at a time. */
function filenameFromNpmPack(stdout: string): string | undefined {
  const parsed = JSON.parse(stdout) as Array<{ filename: string }>;
  return parsed[0]?.filename;
}

function packOne(
  pkg: { path: string; currentVersion: string },
  outDir: string,
  packageManager: 'pnpm' | 'npm' | 'yarn',
  versionMap: Map<string, string>,
): { filename: string; restore: () => void } {
  const isPnpm = packageManager === 'pnpm';
  const restore = isPnpm
    ? () => {}
    : rewriteWorkspaceDeps({ path: pkg.path, version: pkg.currentVersion }, versionMap, packageManager);

  const packArgs = isPnpm
    ? ['pack', '--pack-destination', outDir]
    : ['pack', '--pack-destination', outDir, '--json'];
  const packResult = spawnSync(isPnpm ? 'pnpm' : 'npm', packArgs, { cwd: pkg.path, stdio: 'pipe' });

  if (packResult.status !== 0) {
    const stderr = packResult.stderr?.toString().trim() || packResult.stdout?.toString().trim();
    throw new Error(`${packageManager} pack failed for ${pkg.path}${stderr ? `: ${stderr}` : ''}`);
  }

  const filename = isPnpm
    ? filenameFromPnpmPack(packResult.stdout.toString())
    : filenameFromNpmPack(packResult.stdout.toString());

  if (!filename) {
    throw new Error(`${packageManager} pack produced no tarball for ${pkg.path}`);
  }
  return { filename, restore };
}

/**
 * Pack, statically verify, and clean-install-verify one package — the full
 * per-package unit of work `stage` runs, batched with bounded concurrency
 * by the caller (see KB_STAGE_CONCURRENCY above).
 */
async function stagePackage(
  pkg: { name: string; path: string; currentVersion: string },
  outDir: string,
  packageManager: 'pnpm' | 'npm' | 'yarn',
  versionMap: Map<string, string>,
): Promise<StagedArtifact> {
  const { filename, restore } = packOne(pkg, outDir, packageManager, versionMap);
  try {
    const tarballPath = join(outDir, filename);
    const verifyDir = mkdtempSync(join(tmpdir(), 'kb-stage-verify-'));
    try {
      const extractResult = spawnSync('tar', ['xzf', tarballPath, '-C', verifyDir], { stdio: 'pipe' });
      if (extractResult.status !== 0) {
        throw new Error(`could not extract staged tarball for ${pkg.name}@${pkg.currentVersion}`);
      }
      const issues = verifyExtractedTarball(join(verifyDir, 'package'));
      if (issues.length > 0) {
        throw new Error(`staged artifact verification failed for ${pkg.name}@${pkg.currentVersion}: ${issues.join('; ')}`);
      }
    } finally {
      rmSync(verifyDir, { recursive: true, force: true });
    }

    // Static checks (above) only see THIS package's own manifest — they
    // can't catch an already-published PEER dependency that is itself
    // broken (npm auto-installs peers, so a bad manifest several levels
    // deep in someone else's graph breaks this install too). A real
    // clean-room install is the only check that actually mirrors what a
    // consumer's `npm install` will do. Confirmed this class of failure
    // live: @kb-labs/sdk's own tarball was clean, but installing it still
    // failed because @kb-labs/plugin-execution-factory@2.114.0 (an
    // already-published peer) shipped with a broken devDependency.
    const cleanInstall = await verifyCleanInstall(tarballPath, pkg.name);
    if (!cleanInstall.ok) {
      throw new Error(`staged artifact for ${pkg.name}@${pkg.currentVersion} fails a clean install: ${cleanInstall.error}`);
    }

    const sha256 = createHash('sha256').update(readFileSync(join(outDir, filename))).digest('hex');
    return { name: pkg.name, version: pkg.currentVersion, tarball: filename, sha256 };
  } finally {
    restore();
  }
}

export default defineCommand({
  id: 'release:stage',
  description: 'Pack the currently-committed package versions for a flow into real npm tarballs, once, for `release deliver` to ship',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<StageFlags>): Promise<CommandResult<StagePayload>> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const baseConfig: ReleaseConfig = fileConfig ?? {};

      const flowResult = resolveFlowName(baseConfig, flags);
      if (typeof flowResult !== 'string') {
        const msg = `release:stage ${flowResult.error}`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { ok: false, error: 'Command failed' };
      }
      const flowName = flowResult;

      const config: ReleaseConfig = mergeConfigWithFlow(baseConfig, flowName);
      const outDir = join(repoRoot, flags['out-dir'] ?? '.kb/release/artifacts');
      mkdirSync(outDir, { recursive: true });

      const discoverLoader = useLoader(`Discovering currently-committed packages for flow "${flowName}"...`);
      discoverLoader.start();
      const discovered = await discoverCurrentPackages(repoRoot, undefined, config);
      discoverLoader.succeed(`Found ${discovered.length} package(s) to stage`);

      if (discovered.length === 0) {
        const msg = `No packages found for flow "${flowName}"`;
        if (flags.json) { ctx.ui?.json?.({ outDir, artifacts: [] }); } else { ctx.ui?.write?.(msg); }
        return { ok: false, error: 'Command failed' };
      }

      // versionMap must cover the WHOLE workspace, not just this flow's packages:
      // a flow package can depend on a package owned by a different flow (e.g. sdk
      // depends on @kb-labs/core-retry, which is platform-flow-scoped). Building the
      // map from `discovered` (flow-scoped) alone leaves such cross-flow deps out of
      // versionMap, so rewriteWorkspaceDeps silently skips them (no pinned version to
      // substitute). Only used by the npm/yarn packing path below — pnpm resolves
      // workspace:* on its own and never consults this map.
      const allWorkspacePackages = await discoverCurrentPackages(repoRoot, undefined, baseConfig);
      const versionMap = new Map(allWorkspacePackages.map(pkg => [pkg.name, pkg.currentVersion]));
      const packageManager = config.publish?.packageManager ?? 'pnpm';

      // Each package's real clean-room install (verifyCleanInstall, below) is
      // a genuine network round-trip against the registry — for a lockstep
      // flow the size of `platform` (~150 packages) that's ~150 sequential
      // npm installs if run one at a time. Bounded concurrency keeps the
      // per-package guarantee (see comment below) while cutting wall time by
      // roughly this factor; KB_STAGE_CONCURRENCY overrides the default for
      // tuning against real registry rate limits. Mirrors the same pattern
      // already used for the actual publish step (publish-programmatic.ts).
      const CONCURRENCY = Number(useEnv('KB_STAGE_CONCURRENCY') ?? 6);

      const packLoader = useLoader('Packing tarballs...');
      packLoader.start();
      const artifacts: StagedArtifact[] = [];
      for (let i = 0; i < discovered.length; i += CONCURRENCY) {
        const batch = discovered.slice(i, i + CONCURRENCY);
        const batchArtifacts = await Promise.all(
          batch.map(pkg => stagePackage(pkg, outDir, packageManager, versionMap)),
        );
        artifacts.push(...batchArtifacts);
      }
      packLoader.succeed(`Packed ${artifacts.length} tarball(s) to ${outDir}`);

      writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(artifacts, null, 2) + '\n', 'utf-8');

      const result: StagePayload = { outDir, artifacts };
      if (flags.json) {
        const response = { ok: true as const, result };
        ctx.ui?.json?.(response);
        return response;
      }

      ctx.ui?.sideBox?.({
        title: 'Stage',
        sections: [{
          header: `Staged to ${outDir}`,
          items: artifacts.map(a => `${ctx.ui.symbols.success} ${a.name}@${a.version} → ${a.tarball}`),
        }],
        status: 'success',
      });

      return { ok: true, result };
    },
  },
});
