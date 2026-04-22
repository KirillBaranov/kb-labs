/**
 * Standalone npm publish command — thin adapter over planRelease + publish.
 * No build/verify steps (those belong in release:run pipeline).
 *
 * Token-first (programmatic), OTP fallback for interactive terminal.
 */

import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig, useEnv } from '@kb-labs/sdk';
import { planRelease, type ReleaseConfig } from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { publishPackagesProgrammatic, type ProgrammaticPublishResult } from '../../shared/publish-programmatic';
import { publishPackagesWithOTP, type PublishWithOTPResult } from '../../shared/publish-with-otp';

interface PublishFlags {
  scope?: string;
  otp?: string;
  'dry-run'?: boolean;
  tag?: string;
  access?: string;
  token?: string;
  json?: boolean;
}

interface PublishResult {
  exitCode: number;
  published?: Array<{ name: string; version: string }>;
  failed?: Array<{ name: string; version: string; error: string }>;
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
}

type PublishResultItem = { success: boolean; name: string; version: string; error?: string };

// ── helpers ────────────────────────────────────────────────────────────────

function buildPublishSections(
  results: PublishResultItem[],
  symbols: { success: string; error: string },
): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [];

  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    const items: string[] = [];
    for (const r of successful) {
      items.push(`${symbols.success} ${r.name}@${r.version}`);
      items.push(`  └─ https://www.npmjs.com/package/${r.name}`);
    }
    sections.push({ header: 'Published', items });
  }

  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    sections.push({
      header: 'Failed',
      items: failed.map(r => `${symbols.error} ${r.name}@${r.version} - ${r.error}`),
    });
  }

  return sections;
}

function toPublishResult(results: PublishResultItem[]): PublishResult {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  return {
    exitCode: failed === 0 ? 0 : 1,
    published: results.filter(r => r.success).map(r => ({ name: r.name, version: r.version })),
    failed: results.filter(r => !r.success).map(r => ({
      name: r.name,
      version: r.version,
      error: r.error || 'Unknown error',
    })),
    summary: { total: results.length, successful, failed },
  };
}

// ── command ────────────────────────────────────────────────────────────────

export default defineCommand({
  id: 'release:publish',
  description: 'Publish packages to npm registry',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PublishFlags>): Promise<PublishResult> {
      const { flags } = input;
      const { scope, otp: initialOtp, tag, access, json } = flags;
      const dryRun = flags['dry-run'];
      const token = flags.token ?? useEnv('NPM_TOKEN') ?? useEnv('NODE_AUTH_TOKEN');

      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      const discoveryLoader = useLoader('Discovering packages...');
      discoveryLoader.start();

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = fileConfig ?? {};
      const plan = await planRelease({ cwd: repoRoot, config, scope });

      const packages = plan.packages.map(pkg => ({
        name: pkg.name,
        version: pkg.nextVersion,
        path: pkg.path,
      }));
      discoveryLoader.succeed(`Found ${packages.length} package(s)`);

      if (packages.length === 0) {
        const msg = `No packages found to publish${scope ? ` matching scope: ${scope}` : ''}`;
        if (json) {
          ctx.ui?.json?.({ error: msg });
        } else {
          ctx.ui?.write?.(msg);
        }
        return { exitCode: 1, summary: { total: 0, successful: 0, failed: 0 } };
      }

      let rawResult: ProgrammaticPublishResult | PublishWithOTPResult;
      if (token) {
        rawResult = await publishPackagesProgrammatic({
          packages,
          dryRun,
          otp: initialOtp,
          tag,
          access: access as 'public' | 'restricted' | undefined,
          token,
        });
      } else {
        rawResult = await publishPackagesWithOTP({
          packages,
          dryRun,
          otp: initialOtp,
          tag,
          access: access ?? 'public',
          ui: ctx.ui,
          logger: ctx.platform?.logger,
        });
      }

      const publishResult = toPublishResult(rawResult.results);

      if (json) {
        ctx.ui?.json?.(publishResult);
        return publishResult;
      }

      ctx.ui.sideBox({
        title: dryRun ? 'Publish Dry-Run' : 'Publish Summary',
        sections: buildPublishSections(rawResult.results, ctx.ui.symbols),
        status: publishResult.exitCode === 0 ? 'success' : 'error',
      });

      return publishResult;
    },
  },
});
