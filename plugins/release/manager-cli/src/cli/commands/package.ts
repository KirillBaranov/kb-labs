/**
 * `kb release package --intent <intent.json> --out <bundle-dir> --json`
 *
 * Produces the release's exact bytes from the staged worktree and nowhere else
 * (cutover plan §6A.2). It rejects a tree digest different from the staged
 * `treeSha256`, a package list that differs from the intent, and any version
 * mismatch between the intent and the staged tree.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineCommand, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';

import { normalizeBinaryChecksumsFile, type NormalizedBinary } from '../../shared/bundle/binary-manifest.js';
import { loadCandidateIntent } from '../../shared/bundle/intent.js';
import { packageStagedBundle, type PackagingRecord } from '../../shared/bundle/package.js';
import { readStageState } from '../../shared/bundle/stage-state.js';
import { findRepoRoot } from '../../shared/utils';

interface PackageFlags {
  intent?: string;
  out?: string;
  /** Directory holding built binaries named as in the checksums file. */
  'binaries-dir'?: string;
  /** GoReleaser checksums file, normalized into the binary manifest. */
  'binary-checksums'?: string;
  'binary-repository'?: string;
  'binary-release-tag'?: string;
  json?: boolean;
}

export interface PackagePayload {
  bundleDir: string;
  releaseId: string;
  candidateId: string;
  treeSha256: string;
  packages: PackagingRecord['packages'];
  binaries: PackagingRecord['binaries'];
}

function resolveBinaries(flags: PackageFlags): { dir: string; binaries: NormalizedBinary[] } | undefined {
  if (!flags['binaries-dir']) { return undefined; }

  const dir = resolve(flags['binaries-dir']);
  if (flags['binary-checksums']) {
    if (!flags['binary-repository'] || !flags['binary-release-tag']) {
      throw new Error('--binary-checksums requires --binary-repository and --binary-release-tag');
    }
    const { binaries } = normalizeBinaryChecksumsFile(resolve(flags['binary-checksums']), {
      repository: flags['binary-repository'],
      releaseTag: flags['binary-release-tag'],
    });
    return { dir, binaries };
  }

  // An already-normalized manifest produced by a previous `package` run.
  const manifestPath = resolve(dir, 'binary-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`--binaries-dir needs either --binary-checksums or a binary-manifest.json in ${dir}`);
  }
  const { binaries } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { binaries: NormalizedBinary[] };
  return { dir, binaries };
}

export default defineCommand({
  id: 'release:package',
  description: 'Package the intent\'s exact package set from the staged worktree into a bundle directory',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PackageFlags>): Promise<CommandResult<PackagePayload>> {
      const { flags } = input;
      const fail = (message: string): CommandResult<PackagePayload> => {
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.error?.(message); }
        return { ok: false, error: 'Command failed' };
      };

      if (!flags.intent) { return fail('release package requires --intent <intent.json>'); }
      if (!flags.out) { return fail('release package requires --out <bundle-dir>'); }

      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
      const outDir = resolve(flags.out);

      try {
        const { intent, intentSha256 } = loadCandidateIntent(flags.intent);
        const state = readStageState(repoRoot, intent.candidateId);
        mkdirSync(outDir, { recursive: true });

        const record = packageStagedBundle({
          intent,
          intentSha256,
          state,
          outDir,
          binaries: resolveBinaries(flags),
        });

        const result: PackagePayload = {
          bundleDir: outDir,
          releaseId: record.releaseId,
          candidateId: record.candidateId,
          treeSha256: record.treeSha256,
          packages: record.packages,
          binaries: record.binaries,
        };

        if (flags.json) {
          const response = { ok: true as const, result };
          ctx.ui?.json?.(response);
          return response;
        }

        ctx.ui?.write?.(
          `Packaged ${record.packages.length} tarball(s) and ${record.binaries.length} binary target(s) `
          + `for ${record.releaseId} into ${outDir}`,
        );
        return { ok: true, result };
      } catch (error) {
        return fail(`release package failed: ${(error as Error).message}`);
      }
    },
  },
});
