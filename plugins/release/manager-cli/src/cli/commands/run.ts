/**
 * Release run command — thin adapter over core runReleasePipeline().
 * Mirror of rest/handlers/run-handler.ts for CLI context.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
  useLLM,
  useLoader,
  useConfig,
} from '@kb-labs/sdk';
import {
  runReleasePipeline,
  resolveScopePath,
  type ReleaseConfig,
  type ReleaseReport,
  type PublishablePackage,
  type PublishResult,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { createChangelogGenerator } from '../../shared/changelog-factory';
import { publishPackagesProgrammatic } from '../../shared/publish-programmatic';
import { publishPackagesWithOTP } from '../../shared/publish-with-otp';

interface RunFlags {
  scope?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  strict?: boolean;
  'dry-run'?: boolean;
  'skip-checks'?: boolean;
  'skip-build'?: boolean;
  'skip-verify'?: boolean;
  json?: boolean;
}

type ReleaseRunResult = CommandResult & {
  report?: ReleaseReport;
};

export default defineCommand({
  id: 'release:run',
  description: 'Execute release process (plan, check, publish)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunFlags>): Promise<ReleaseRunResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);
      const dryRun = flags['dry-run'] === true;

      const configLoader = useLoader('Loading configuration...');
      configLoader.start();
      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
        ...(flags.strict !== undefined && { strict: flags.strict }),
      };
      configLoader.succeed('Configuration loaded');

      const llm = useLLM();
      const changelog = createChangelogGenerator(config, llm ?? undefined);

      // Token-first publisher (same as REST), OTP fallback for interactive terminal
      const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
      const publisher = {
        async publish(packages: PublishablePackage[], opts: { dryRun?: boolean; access?: string }): Promise<PublishResult> {
          if (token) {
            return publishPackagesProgrammatic({ packages, dryRun: opts.dryRun }) as any;
          }
          return publishPackagesWithOTP({
            packages,
            dryRun: opts.dryRun,
            access: opts.access ?? 'public',
            ui: ctx.ui,
            logger: ctx.platform?.logger,
          }) as any;
        },
      };

      const pipelineLoader = useLoader('Running release pipeline...');
      pipelineLoader.start();

      const scopeCwd = await resolveScopePath(repoRoot, flags.scope || 'root');

      const result = await runReleasePipeline({
        cwd,
        repoRoot,
        scopeCwd,
        scope: flags.scope,
        config,
        dryRun,
        skipChecks: flags['skip-checks'],
        skipBuild: flags['skip-build'],
        skipVerify: flags['skip-verify'],
        checks: (flags.scope ? config.scopes?.[flags.scope]?.checks : undefined) ?? config.checks ?? [],
        publisher,
        changelog,
        logger: ctx.platform?.logger,
        onProgress: (_stage, message) => pipelineLoader.update({ text: message }),
      });

      pipelineLoader.succeed(result.success ? 'Release completed' : 'Release failed');

      if (flags.json) {
        ctx.ui?.json?.(result.report);
      } else {
        const report = result.report;
        const sections: Array<{ header?: string; items: string[] }> = [];

        if (report.result.published?.length) {
          sections.push({
            header: 'Published',
            items: report.result.published.map(p => `${ctx.ui.symbols.success} ${p}`),
          });
        }

        if (report.result.skipped?.length) {
          sections.push({
            header: 'Skipped (dry-run)',
            items: report.result.skipped.map(p => `${ctx.ui.symbols.info} ${p}`),
          });
        }

        if (report.result.errors?.length) {
          sections.push({
            header: 'Errors',
            items: report.result.errors.map(e => `${ctx.ui.symbols.error} ${e}`),
          });
        }

        if (report.result.git) {
          const g = report.result.git;
          sections.push({
            header: 'Git',
            items: [
              `Committed: ${g.committed}`,
              `Tags: ${g.tagged?.join(', ') || 'none'}`,
              `Pushed: ${g.pushed}`,
            ],
          });
        }

        ctx.ui.sideBox({
          title: 'Release',
          sections,
          status: result.success ? 'success' : 'error',
          timing: report.result.timingMs,
        });
      }

      return { exitCode: result.success ? 0 : 1, report: result.report };
    },
  },
});
