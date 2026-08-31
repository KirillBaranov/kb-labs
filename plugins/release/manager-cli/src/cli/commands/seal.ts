/**
 * `kb release seal --bundle <bundle-dir> --json`
 *
 * Reads the exact local artifacts, builds the compatibility graph and the
 * release index, and produces `provenance.json` plus the canonical
 * `bundle.json` carrying `bundleSha256` (cutover plan §6A.2).
 *
 * Verification is not left to the caller: sealing runs the full bundle verifier
 * over its own output and fails rather than returning a bundle that
 * `verify-bundle` would reject. `verify-bundle` remains mandatory as an
 * independent check before Workflow receives a bundle locator — this only makes
 * it impossible to skip that step by accident.
 */

import { resolve } from 'node:path';

import { defineCommand, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';

import { kbCreateReleaseIndexSealer, sealBundle } from '../../shared/bundle/seal.js';
import { findRepoRoot } from '../../shared/utils';

interface SealFlags {
  bundle?: string;
  channel?: string;
  registry?: string;
  'platform-package'?: string;
  'sdk-package'?: string;
  'platform-requires'?: string;
  'platform-member-packages'?: string;
  'platform-adapter-config'?: string;
  'platform-adapter-options'?: string;
  'sealer-bin'?: string;
  json?: boolean;
}

export interface SealPayload {
  bundleDir: string;
  releaseId: string;
  candidateId: string;
  bundleSha256: string;
  indexSha256: string;
  treeSha256: string;
  channelLabel: string;
  versions: { platform: string; sdk: string | null };
  counts: { files: number; packages: number; binaries: number; nodes: number; edges: number; profiles: number };
}

function list(value: string | undefined): string[] | undefined {
  if (!value) { return undefined; }
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export default defineCommand({
  id: 'release:seal',
  description: 'Build the release index and compatibility graph over packaged artifacts and seal the bundle',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SealFlags>): Promise<CommandResult<SealPayload>> {
      const { flags } = input;
      const fail = (message: string): CommandResult<SealPayload> => {
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.error?.(message); }
        return { ok: false, error: 'Command failed' };
      };

      if (!flags.bundle) { return fail('release seal requires --bundle <dir>'); }

      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());

      try {
        const { bundle, provenance, verification } = sealBundle({
          bundleDir: resolve(flags.bundle),
          channel: flags.channel ?? 'canary',
          registry: flags.registry,
          platformPackage: flags['platform-package'],
          sdkPackage: flags['sdk-package'],
          platformRequires: list(flags['platform-requires']),
          platformMemberPackages: list(flags['platform-member-packages']),
          platformAdapterConfig: flags['platform-adapter-config']
            ? JSON.parse(flags['platform-adapter-config']) as Record<string, string>
            : undefined,
          platformAdapterOptions: flags['platform-adapter-options']
            ? JSON.parse(flags['platform-adapter-options']) as Record<string, unknown>
            : undefined,
          indexSealer: kbCreateReleaseIndexSealer({
            sealerBin: flags['sealer-bin'],
            kbCreateDir: resolve(repoRoot, 'tools/kb-create'),
          }),
        });

        const result: SealPayload = {
          bundleDir: verification.bundleDir,
          releaseId: bundle.releaseId,
          candidateId: bundle.candidateId,
          bundleSha256: bundle.bundleSha256,
          indexSha256: bundle.indexSha256,
          treeSha256: bundle.treeSha256,
          channelLabel: provenance.index.channelLabel,
          versions: provenance.provenance.versions,
          counts: {
            files: verification.counts.files,
            packages: verification.counts.packages,
            binaries: verification.counts.binaries,
            nodes: verification.counts.nodes,
            edges: verification.counts.edges,
            profiles: verification.counts.profiles,
          },
        };

        if (flags.json) {
          const response = { ok: true as const, result };
          ctx.ui?.json?.(response);
          return response;
        }

        ctx.ui?.write?.(
          `Sealed ${bundle.releaseId} as ${bundle.bundleSha256}\n`
          + `index: ${bundle.indexSha256} (${provenance.index.version}, ${provenance.index.channelLabel})\n`
          + `tree:  ${bundle.treeSha256}`,
        );
        return { ok: true, result };
      } catch (error) {
        return fail(`release seal failed: ${(error as Error).message}`);
      }
    },
  },
});
