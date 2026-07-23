/**
 * Deliver command — ships the tarballs `release stage` already packed to a
 * destination ("target"), by name. This is the thin-CI half of the
 * "plugin prepares, CI delivers" release plan: CI's only job is to have
 * the right target credentials and call this one command with the tag —
 * package selection, tag→flow resolution, retry/backoff, and post-delivery
 * verification all live here, not in CI YAML.
 *
 * Deliberately reads `manifest.json` from `--artifacts-dir` (written by
 * `release stage`) instead of rediscovering or rebuilding packages — the
 * whole point is to ship the exact bytes that were already packed and
 * validated, not a fresh equivalent pack.
 *
 * Not to be confused with `release promote` (`promote.ts`) — that command
 * still re-packs from the working tree at publish time (the older,
 * Verdaccio-pre-flight flow from ADR-0001) and remains in place unchanged.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig, useEnv } from '@kb-labs/sdk';
import {
  mergeConfigWithFlow,
  resolvePublishTag,
  resolvePublishRegistry,
  verifyAgainstRegistry,
  type ReleaseConfig,
  type PublishablePackage,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { publishPackagesProgrammatic, type PackageToPublish } from '../../shared/publish-programmatic';
import { resolveFlowName, type FlowResolvableFlags } from '../../shared/resolve-flow';
import type { StagedArtifact } from './stage';

const REGISTRY_VERIFY_RETRIES = 5;

interface DeliverFlags extends FlowResolvableFlags {
  target?: string;
  'artifacts-dir'?: string;
  tag?: string;
  registry?: string;
  otp?: string;
  access?: string;
  token?: string;
  'dry-run'?: boolean;
  json?: boolean;
}

interface DeliverResult {
  exitCode: number;
  target?: string;
  published?: Array<{ name: string; version: string }>;
  failed?: Array<{ name: string; version: string; error: string }>;
  verifyIssues?: string[];
}

function loadManifest(artifactsDir: string): StagedArtifact[] | { error: string } {
  const manifestPath = join(artifactsDir, 'manifest.json');
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as StagedArtifact[];
  } catch {
    return { error: `No manifest.json found at ${manifestPath} — run \`kb release stage\` first` };
  }
}

export default defineCommand({
  id: 'release:deliver',
  description: 'Ship the tarballs `release stage` already packed to a target (npm) — no packing, no rebuild',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DeliverFlags>): Promise<DeliverResult> {
      const { flags } = input;
      const target = flags.target ?? 'npm';

      if (target !== 'npm') {
        const msg = `release:deliver --target ${target} is not implemented — only "npm" ships this pass (see release plan's out-of-scope section for github-release/mirror)`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { exitCode: 1 };
      }

      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const baseConfig: ReleaseConfig = fileConfig ?? {};

      const flowResult = resolveFlowName(baseConfig, flags);
      if (typeof flowResult !== 'string') {
        const msg = `release:deliver ${flowResult.error}`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { exitCode: 1 };
      }
      const config: ReleaseConfig = mergeConfigWithFlow(baseConfig, flowResult);

      const artifactsDir = join(repoRoot, flags['artifacts-dir'] ?? '.kb/release/artifacts');
      const manifest = loadManifest(artifactsDir);
      if (!Array.isArray(manifest)) {
        if (flags.json) { ctx.ui?.json?.({ error: manifest.error }); } else { ctx.ui?.error?.(manifest.error); }
        return { exitCode: 1 };
      }
      if (manifest.length === 0) {
        const msg = `manifest.json at ${artifactsDir} lists no packages`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { exitCode: 1 };
      }

      const dryRun = flags['dry-run'];
      const npmTag = flags.tag ?? resolvePublishTag(config, 'stable');
      const registry = flags.registry ?? resolvePublishRegistry(config, 'stable');
      const token = flags.token ?? useEnv('NPM_TOKEN') ?? useEnv('NODE_AUTH_TOKEN');

      const packages: PackageToPublish[] = manifest.map(a => ({
        name: a.name,
        version: a.version,
        path: artifactsDir,
        tarballPath: join(artifactsDir, a.tarball),
      }));

      const publishLoader = useLoader(`Delivering ${packages.length} package(s) to npm...`);
      publishLoader.start();

      // Publishing pre-built tarballs via `npm publish <tarball>` specifically
      // (not pnpm/yarn) — these were packed with `npm pack` in `release
      // stage`, and npm's tarball-argument publish is the well-established
      // path; no need to introduce pnpm/yarn tarball-publish behavior here.
      const publishResult = await publishPackagesProgrammatic({
        packages,
        packageManager: 'npm',
        dryRun,
        otp: flags.otp,
        tag: npmTag,
        access: (flags.access as 'public' | 'restricted' | undefined) ?? config.publish?.access,
        registry,
        token,
      });

      const failed = publishResult.results.filter(r => !r.success);
      if (failed.length > 0) {
        publishLoader.fail(`${failed.length} package(s) failed to publish`);
        const result: DeliverResult = {
          exitCode: 1,
          target,
          published: publishResult.results.filter(r => r.success).map(r => ({ name: r.name, version: r.version })),
          failed: failed.map(r => ({ name: r.name, version: r.version, error: r.error ?? 'Unknown error' })),
        };
        if (flags.json) { ctx.ui?.json?.(result); } else {
          ctx.ui?.sideBox?.({
            title: 'Deliver — npm',
            sections: [{ header: 'Failed', items: failed.map(r => `${ctx.ui.symbols.error} ${r.name}@${r.version} — ${r.error}`) }],
            status: 'error',
          });
        }
        return result;
      }
      publishLoader.succeed(`Delivered ${publishResult.results.length} package(s) to npm`);

      if (dryRun) {
        const result: DeliverResult = { exitCode: 0, target, published: publishResult.results.map(r => ({ name: r.name, version: r.version })) };
        if (flags.json) { ctx.ui?.json?.(result); }
        return result;
      }

      // Post-delivery verification against the real registry — this is the
      // gap `release promote` always had (it never verified anything after
      // publishing). Real npm has propagation lag Verdaccio doesn't, hence
      // the retry budget here instead of a single-shot check.
      const verifyLoader = useLoader('Verifying delivery against the registry...');
      verifyLoader.start();
      const verifyTargets: PublishablePackage[] = manifest.map(a => ({ name: a.name, version: a.version, path: artifactsDir }));
      const verifyResults = await verifyAgainstRegistry(verifyTargets, {
        registry,
        retries: REGISTRY_VERIFY_RETRIES,
        logger: ctx.platform?.logger,
      });
      const verifyIssues = verifyResults.flatMap(r => r.issues);

      const result: DeliverResult = {
        exitCode: verifyIssues.length === 0 ? 0 : 1,
        target,
        published: publishResult.results.map(r => ({ name: r.name, version: r.version })),
        verifyIssues,
      };

      if (verifyIssues.length > 0) {
        // The publish already succeeded and is live — never attempt
        // npm unpublish here. Surface loudly and let a human decide.
        verifyLoader.fail(`Delivery verification found ${verifyIssues.length} issue(s) — packages are published, verification failed`);
      } else {
        verifyLoader.succeed('Delivery verified against the registry');
      }

      if (flags.json) {
        ctx.ui?.json?.(result);
        return result;
      }

      ctx.ui?.sideBox?.({
        title: 'Deliver — npm',
        sections: [
          { header: `Delivered to ${registry} (tag: ${npmTag})`, items: publishResult.results.map(r => `${ctx.ui.symbols.success} ${r.name}@${r.version}`) },
          ...(verifyIssues.length > 0 ? [{ header: 'Verification issues', items: verifyIssues.map(i => `${ctx.ui.symbols.error} ${i}`) }] : []),
        ],
        status: verifyIssues.length === 0 ? 'success' : 'error',
      });

      return result;
    },
  },
});
