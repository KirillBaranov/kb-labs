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

import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig, useEnv, type CommandResult } from '@kb-labs/sdk';
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
const REGISTRY_VISIBILITY_DEADLINE_MS = 15 * 60_000;

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

interface DeliverFailure {
  name: string;
  version: string;
  error: string;
  errorCode?: string;
  errorHint?: string;
}

interface DeliverPayload {
  success: boolean;
  target?: string;
  published?: Array<{ name: string; version: string }>;
  failed?: DeliverFailure[];
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

/**
 * Append a markdown summary to the GitHub Actions job summary panel, when
 * running under Actions (`GITHUB_STEP_SUMMARY` is set) — otherwise a no-op.
 * This is what actually makes a failure diagnosable without digging through
 * raw step logs: the exact npm error, per package, rendered right in the
 * run's UI instead of buried in thousands of log lines.
 */
function writeGithubStepSummary(markdown: string): void {
  const summaryPath = useEnv('GITHUB_STEP_SUMMARY');
  if (!summaryPath) { return; }
  try {
    appendFileSync(summaryPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  } catch {
    // Best-effort — never let summary writing fail the actual delivery.
  }
}

function buildFailureSummaryMarkdown(target: string, publishedCount: number, failed: DeliverFailure[]): string {
  const lines: string[] = [
    `## ❌ \`release deliver --target ${target}\` — ${failed.length} package(s) failed`,
    '',
    `${publishedCount} package(s) delivered successfully; ${failed.length} did not.`,
    '',
  ];
  for (const f of failed) {
    lines.push(`### \`${f.name}@${f.version}\`${f.errorCode ? ` — \`${f.errorCode}\`` : ''}`);
    if (f.errorHint) { lines.push('', `**${f.errorHint}**`); }
    lines.push('', '```', f.error.slice(0, 2000), '```', '');
  }
  return lines.join('\n');
}

export default defineCommand({
  id: 'release:deliver',
  description: 'Ship the tarballs `release stage` already packed to a target (npm) — no packing, no rebuild',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DeliverFlags>): Promise<CommandResult<DeliverPayload>> {
      const { flags } = input;
      const target = flags.target ?? 'npm';

      if (target !== 'npm') {
        const msg = `release:deliver --target ${target} is not implemented — only "npm" ships this pass (see release plan's out-of-scope section for github-release/mirror)`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { ok: false, error: 'Command failed' };
      }

      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const fileConfig = await useConfig<ReleaseConfig>();
      const baseConfig: ReleaseConfig = fileConfig ?? {};

      const flowResult = resolveFlowName(baseConfig, flags);
      if (typeof flowResult !== 'string') {
        const msg = `release:deliver ${flowResult.error}`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { ok: false, error: 'Command failed' };
      }
      const config: ReleaseConfig = mergeConfigWithFlow(baseConfig, flowResult);

      const artifactsDir = join(repoRoot, flags['artifacts-dir'] ?? '.kb/release/artifacts');
      const manifest = loadManifest(artifactsDir);
      if (!Array.isArray(manifest)) {
        if (flags.json) { ctx.ui?.json?.({ error: manifest.error }); } else { ctx.ui?.error?.(manifest.error); }
        return { ok: false, error: 'Command failed' };
      }
      if (manifest.length === 0) {
        const msg = `manifest.json at ${artifactsDir} lists no packages`;
        if (flags.json) { ctx.ui?.json?.({ error: msg }); } else { ctx.ui?.error?.(msg); }
        return { ok: false, error: 'Command failed' };
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
        const publishedList = publishResult.results.filter(r => r.success).map(r => ({ name: r.name, version: r.version }));
        const failedList: DeliverFailure[] = failed.map(r => ({
          name: r.name,
          version: r.version,
          error: r.error ?? 'Unknown error',
          errorCode: r.errorCode,
          errorHint: r.errorHint,
        }));
        const result: DeliverPayload = { success: false, target, published: publishedList, failed: failedList };

        writeGithubStepSummary(buildFailureSummaryMarkdown(target, publishedList.length, failedList));

        const response = { ok: false as const, error: 'Delivery failed', result };
        if (flags.json) { ctx.ui?.json?.(response); } else {
          ctx.ui?.sideBox?.({
            title: 'Deliver — npm',
            sections: [{
              header: `Failed (${publishedList.length} delivered ok)`,
              items: failedList.map(r => `${ctx.ui.symbols.error} ${r.name}@${r.version}${r.errorCode ? ` [${r.errorCode}]` : ''} — ${r.errorHint ?? r.error}`),
            }],
            status: 'error',
          });
        }
        return response;
      }
      publishLoader.succeed(`Delivered ${publishResult.results.length} package(s) to npm`);

      if (dryRun) {
        const result: DeliverPayload = { success: true, target, published: publishResult.results.map(r => ({ name: r.name, version: r.version })) };
        const response = { ok: true as const, result };
        if (flags.json) { ctx.ui?.json?.(response); }
        return response;
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
        visibilityDeadlineMs: REGISTRY_VISIBILITY_DEADLINE_MS,
        logger: ctx.platform?.logger,
      });
      const verifyIssues = verifyResults.flatMap(r => r.issues);

      const result: DeliverPayload = {
        success: verifyIssues.length === 0,
        target,
        published: publishResult.results.map(r => ({ name: r.name, version: r.version })),
        verifyIssues,
      };

      if (verifyIssues.length > 0) {
        // The publish already succeeded and is live — never attempt
        // npm unpublish here. Surface loudly and let a human decide.
        verifyLoader.fail(`Delivery verification found ${verifyIssues.length} issue(s) — packages are published, verification failed`);
        writeGithubStepSummary([
          `## ⚠️ \`release deliver --target ${target}\` — publish succeeded, verification found ${verifyIssues.length} issue(s)`,
          '',
          'Packages are already live on the registry — this is a verification problem, not a publish failure, and nothing was rolled back (npm unpublish is never attempted automatically).',
          '',
          ...verifyIssues.map(i => `- ${i}`),
        ].join('\n'));
      } else {
        verifyLoader.succeed('Delivery verified against the registry');
      }

      if (flags.json) {
        const response = verifyIssues.length === 0
          ? { ok: true as const, result }
          : { ok: false as const, error: 'Delivery verification failed', result };
        ctx.ui?.json?.(response);
        return response;
      }

      ctx.ui?.sideBox?.({
        title: 'Deliver — npm',
        sections: [
          { header: `Delivered to ${registry} (tag: ${npmTag})`, items: publishResult.results.map(r => `${ctx.ui.symbols.success} ${r.name}@${r.version}`) },
          ...(verifyIssues.length > 0 ? [{ header: 'Verification issues', items: verifyIssues.map(i => `${ctx.ui.symbols.error} ${i}`) }] : []),
        ],
        status: verifyIssues.length === 0 ? 'success' : 'error',
      });

      return verifyIssues.length === 0
        ? { ok: true, result }
        : { ok: false, error: 'Delivery verification failed', result };
    },
  },
});
