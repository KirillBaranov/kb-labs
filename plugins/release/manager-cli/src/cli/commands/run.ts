/**
 * Release run command — thin adapter over core runReleasePipeline().
 * Mirror of rest/handlers/run-handler.ts for CLI context.
 *
 * Flow:
 *   1. Load config
 *   2. Plan (discover packages, compute versions)
 *   3. Show plan table + confirm [y/N]  (skipped with --yes or --dry-run)
 *   4. Execute pipeline with elapsed-time progress
 */

import * as readline from 'node:readline/promises';
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
  planRelease,
  resolveScopePath,
  type ReleaseConfig,
  type ReleaseReport,
  type CheckResult,
  type PublishablePackage,
  type PublishResult,
} from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { createChangelogGenerator } from '../../shared/changelog-factory';
import { publishPackagesProgrammatic } from '../../shared/publish-programmatic';
import { publishPackagesWithOTP } from '../../shared/publish-with-otp';

interface RunFlags {
  scope?: string;
  flow?: string;
  bump?: 'patch' | 'minor' | 'major' | 'auto';
  strict?: boolean;
  'dry-run'?: boolean;
  'skip-checks'?: boolean;
  'skip-build'?: boolean;
  'skip-verify'?: boolean;
  'no-verify'?: boolean;
  yes?: boolean;
  json?: boolean;
}

type ReleaseRunResult = CommandResult & {
  report?: ReleaseReport;
};

const BUMP_SYMBOL: Record<string, string> = {
  major: '!!',
  minor: '+',
  patch: '·',
  auto: '?',
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
      const skipYes = flags.yes === true || dryRun;

      // 1. Load config
      const configLoader = useLoader('Loading configuration...');
      configLoader.start();
      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = {
        ...fileConfig,
        ...(flags.bump && { bump: flags.bump }),
        ...(flags.strict !== undefined && { strict: flags.strict }),
      };
      configLoader.succeed('Configuration loaded');

      const scopeCwd = await resolveScopePath(repoRoot, flags.scope || 'root');

      // 2. Plan — run separately so we can show it before asking for confirm
      const planLoader = useLoader('Discovering packages...');
      planLoader.start();
      const plan = await planRelease({
        cwd: repoRoot,
        config,
        scope: flags.scope,
        flow: flags.flow,
        bumpOverride: config.bump as any,
      });
      planLoader.succeed(`Found ${plan.packages.length} package(s)`);

      if (plan.packages.length === 0) {
        ctx.ui.sideBox({
          title: 'Release',
          sections: [{ items: [`${ctx.ui.symbols.warning} No packages to release`] }],
          status: 'info',
        });
        return { exitCode: 0 };
      }

      // 3. Show plan table
      if (!flags.json) {
        const rows = plan.packages.map(pkg => {
          const bump = pkg.bump ?? 'auto';
          const sym = BUMP_SYMBOL[bump] ?? '?';
          return `  ${sym}  ${pkg.name.padEnd(40)} ${pkg.currentVersion.padStart(8)}  →  ${pkg.nextVersion}`;
        });

        ctx.ui.sideBox({
          title: dryRun ? 'Release Plan (dry-run)' : 'Release Plan',
          sections: [
            {
              header: `${plan.packages.length} package(s) · strategy: ${config.versioningStrategy ?? 'independent'}${flags.flow ? ` · flow: ${flags.flow}` : ''}`,
              items: rows,
            },
          ],
          status: 'info',
        });

        if (flags['no-verify']) {
          ctx.ui.write?.(`  ⚠️  --no-verify: git pre-push hooks will be skipped\n`);
        }
      }

      // 4. Confirm (skip with --yes or --dry-run)
      if (!skipYes) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        let answer: string;
        try {
          answer = await rl.question('\nProceed with release? [y/N] ');
        } finally {
          rl.close();
        }

        if (answer.trim().toLowerCase() !== 'y') {
          ctx.ui.sideBox({
            title: 'Release',
            sections: [{ items: [`${ctx.ui.symbols.info} Cancelled`] }],
            status: 'info',
          });
          return { exitCode: 0 };
        }
      }

      // 5. Execute pipeline
      const llm = useLLM();
      const changelog = createChangelogGenerator(config, llm ?? undefined);

      const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
      const packageManager = config.workspace?.type ?? config.publish?.packageManager ?? 'pnpm';
      const publisher = {
        async publish(packages: PublishablePackage[], opts: { dryRun?: boolean; access?: string }): Promise<PublishResult> {
          if (token) {
            return publishPackagesProgrammatic({ packages, packageManager, dryRun: opts.dryRun }) as any;
          }
          return publishPackagesWithOTP({
            packages,
            packageManager,
            dryRun: opts.dryRun,
            access: opts.access ?? 'public',
            ui: ctx.ui,
            logger: ctx.platform?.logger,
          }) as any;
        },
      };

      const pipelineLoader = useLoader('Running release pipeline...');
      pipelineLoader.start();

      const pipelineStart = Date.now();

      const result = await runReleasePipeline({
        cwd,
        repoRoot,
        scopeCwd,
        scope: flags.scope,
        flow: flags.flow,
        config,
        dryRun,
        skipChecks: flags['skip-checks'],
        skipBuild: flags['skip-build'],
        skipVerify: flags['skip-verify'],
        noVerify: flags['no-verify'],
        checks: (flags.flow ? config.flows?.[flags.flow]?.checks : undefined)
             ?? (flags.scope ? config.scopes?.[flags.scope]?.checks : undefined)
             ?? config.checks ?? [],
        publisher,
        changelog,
        logger: ctx.platform?.logger,
        onProgress: (_stage, message) => {
          const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
          pipelineLoader.update({ text: `[${elapsed}s] ${message}` });
        },
      });

      pipelineLoader.succeed(result.success ? 'Release completed' : 'Release failed');

      if (flags.json) {
        ctx.ui?.json?.(result.report);
      } else {
        const report = result.report;
        const sections: Array<{ header?: string; items: string[] }> = [];

        if (!dryRun && report.result.published?.length) {
          sections.push({
            header: 'Published',
            items: report.result.published.map(p => `${ctx.ui.symbols.success} ${p}`),
          });
        }

        if (dryRun && report.result.skipped?.length) {
          sections.push({
            header: 'Would publish (dry-run)',
            items: report.result.skipped.map(p => `${ctx.ui.symbols.info} ${p.replace(' (dry-run)', '')}`),
          });
        }

        if (report.result.checks) {
          const checkEntries = (Object.values(report.result.checks) as CheckResult[]).filter(Boolean);
          const passed = checkEntries.filter(c => c.ok);
          const failed = checkEntries.filter(c => !c.ok && c.hint !== 'optional');
          const skipped = checkEntries.filter(c => !c.ok && c.hint === 'optional');

          if (checkEntries.length > 0) {
            const checkItems: string[] = [];

            for (const c of checkEntries) {
              const sym = c.ok ? ctx.ui.symbols.success : (c.hint === 'optional' ? ctx.ui.symbols.warning : ctx.ui.symbols.error);
              const timing = c.timingMs ? ` (${(c.timingMs / 1000).toFixed(1)}s)` : '';
              checkItems.push(`${sym} ${c.id}${timing}`);

              if (!c.ok && c.hint !== 'optional') {
                if (c.details?.packagePath) checkItems.push(`     package: ${c.details.packagePath}`);
                if (c.details?.error) checkItems.push(`     reason:  ${c.details.error}`);
                const output = (c.details?.stderr || c.details?.stdout || '').trim();
                if (output) {
                  const lines = output.split('\n').slice(0, 8);
                  checkItems.push(`     output:`);
                  for (const line of lines) checkItems.push(`       ${line}`);
                }
                if (c.packages?.filter(p => !p.ok).length) {
                  const failedPkgs = c.packages.filter(p => !p.ok);
                  checkItems.push(`     failed in ${failedPkgs.length}/${c.packages.length} package(s):`);
                  for (const pkg of failedPkgs.slice(0, 10)) {
                    checkItems.push(`       - ${pkg.path}${pkg.details?.error ? `: ${pkg.details.error}` : ''}`);
                  }
                }
              }
            }

            sections.push({
              header: `Checks — ${passed.length} passed, ${failed.length} failed${skipped.length ? `, ${skipped.length} skipped` : ''}`,
              items: checkItems,
            });
          }
        }

        if (report.result.errors?.length && !report.result.checks) {
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
