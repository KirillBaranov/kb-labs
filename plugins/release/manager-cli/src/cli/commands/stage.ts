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
import { join } from 'node:path';
import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig, type CommandResult } from '@kb-labs/sdk';
import {
  discoverCurrentPackages,
  mergeConfigWithFlow,
  verifyExtractedTarball,
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

      const versionMap = new Map(discovered.map(pkg => [pkg.name, pkg.currentVersion]));
      const artifacts: StagedArtifact[] = [];

      const packLoader = useLoader('Packing tarballs...');
      packLoader.start();
      for (const pkg of discovered) {
        const restore = rewriteWorkspaceDeps({ path: pkg.path, version: pkg.currentVersion }, versionMap, 'npm');
        try {
          const packResult = spawnSync('npm', ['pack', '--pack-destination', outDir, '--json'], {
            cwd: pkg.path,
            stdio: 'pipe',
          });
          if (packResult.status !== 0) {
            const stderr = packResult.stderr?.toString().trim() || packResult.stdout?.toString().trim();
            throw new Error(`npm pack failed for ${pkg.name}@${pkg.currentVersion}${stderr ? `: ${stderr}` : ''}`);
          }
          const parsed = JSON.parse(packResult.stdout.toString()) as Array<{ filename: string }>;
          const filename = parsed[0]?.filename;
          if (!filename) {
            throw new Error(`npm pack produced no tarball for ${pkg.name}@${pkg.currentVersion}`);
          }
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
          const sha256 = createHash('sha256').update(readFileSync(join(outDir, filename))).digest('hex');
          artifacts.push({ name: pkg.name, version: pkg.currentVersion, tarball: filename, sha256 });
        } finally {
          restore();
        }
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
