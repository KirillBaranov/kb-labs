/**
 * Standalone npm publish command — thin adapter over planRelease + publish.
 * No build/verify steps (those belong in release:run pipeline).
 *
 * Token-first (programmatic), OTP fallback for interactive terminal.
 */

import { defineCommand, type CLIInput, type PluginContextV3, useLoader, useConfig } from '@kb-labs/sdk';
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

export default defineCommand({
  id: 'release:publish',
  description: 'Publish packages to npm registry',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<PublishFlags>): Promise<PublishResult> {
      const { flags } = input;
      const { scope, otp: initialOtp, tag, access, json } = flags;
      const dryRun = flags['dry-run'];
      const token = flags.token ?? process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;

      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      // 1. Discover packages via planRelease
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

      // 2. Publish — token-first (programmatic), OTP fallback for interactive terminal
      let result: ProgrammaticPublishResult | PublishWithOTPResult;
      if (token) {
        result = await publishPackagesProgrammatic({
          packages,
          dryRun,
          otp: initialOtp,
          tag,
          access: access as 'public' | 'restricted' | undefined,
          token,
        });
      } else {
        result = await publishPackagesWithOTP({
          packages,
          dryRun,
          otp: initialOtp,
          tag,
          access: access ?? 'public',
          ui: ctx.ui,
          logger: ctx.platform?.logger,
        });
      }

      // 3. Format output
      const successful = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success).length;

      const publishResult: PublishResult = {
        exitCode: failed === 0 ? 0 : 1,
        published: result.results.filter((r) => r.success).map((r) => ({ name: r.name, version: r.version })),
        failed: result.results.filter((r) => !r.success).map((r) => ({
          name: r.name,
          version: r.version,
          error: r.error || 'Unknown error',
        })),
        summary: { total: result.results.length, successful, failed },
      };

      if (json) {
        ctx.ui?.json?.(publishResult);
        return publishResult;
      }

      const sections: Array<{ header?: string; items: string[] }> = [];

      if (successful > 0) {
        const successItems: string[] = [];
        for (const r of result.results.filter((r) => r.success)) {
          successItems.push(`${ctx.ui.symbols.success} ${r.name}@${r.version}`);
          successItems.push(`  └─ https://www.npmjs.com/package/${r.name}`);
        }
        sections.push({ header: 'Published', items: successItems });
      }

      if (failed > 0) {
        const failItems = result.results
          .filter((r) => !r.success)
          .map((r) => `${ctx.ui.symbols.error} ${r.name}@${r.version} - ${r.error}`);
        sections.push({ header: 'Failed', items: failItems });
      }

      ctx.ui.sideBox({
        title: dryRun ? 'Publish Dry-Run' : 'Publish Summary',
        sections,
        status: failed === 0 ? 'success' : 'error',
      });

      return publishResult;
    },
  },
});
