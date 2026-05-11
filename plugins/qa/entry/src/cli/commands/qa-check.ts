import { defineCommand, type CLIInput, useConfig, type PluginContextV3 } from '@kb-labs/sdk';
import type { QAPluginConfig, QACheckConfig } from '@kb-labs/qa-contracts';
import {
  getWorkspacePackages,
  runCustomChecks,
  createHistoryEntry,
  appendEntry,
  buildJsonReport,
} from '@kb-labs/qa-core';

interface QACheckFlags {
  id: string;
  base?: string;
  context?: string;
  json?: boolean;
  save?: boolean;
}

export const qaCheckFlags = {
  id: {
    type: 'string',
    description: 'Check ID to run (must match a check in qa.checks config)',
    demandOption: true,
  },
  base: {
    type: 'string',
    description: 'Base branch/commit for diff strategies (diffOnly, newFiles). Default: main',
    default: 'main',
  },
  context: {
    type: 'string',
    description: 'JSON context to attach to the history entry (e.g. {"taskId":"123","agentId":"claude"})',
  },
  json: {
    type: 'boolean',
    description: 'Output structured JSON report',
    default: false,
  },
  save: {
    type: 'boolean',
    description: 'Save result to history after running',
    default: true,
  },
} as const;

export type QACheckFlagsType = typeof qaCheckFlags;

export default defineCommand({
  id: 'qa:check',
  description: 'Run a single QA check atomically and optionally save to history',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QACheckFlags>) {
      const { ui } = ctx;
      const { flags } = input;
      const rootDir = ctx.cwd;
      const checkId = flags.id as string;
      const base = (flags.base as string | undefined) ?? 'main';
      const isJson = !!flags.json;
      const shouldSave = flags.save !== false;

      let config: QAPluginConfig | undefined;
      try {
        config = await Promise.race([
          useConfig<QAPluginConfig>(),
          new Promise<undefined>((resolve) => { setTimeout(() => resolve(undefined), 3000); }),
        ]);
      } catch {
        // config not available
      }

      // Find the check config by id
      const allChecks: QACheckConfig[] = config?.checks ?? [];
      const checkConfig = allChecks.find(c => c.id === checkId);

      if (!checkConfig) {
        const msg = `Check "${checkId}" not found in qa.checks config`;
        if (isJson) {
          ui?.json?.({ status: 'error', message: msg });
        } else {
          ui?.error?.(msg, { title: 'QA Check Error' });
        }
        return { exitCode: 1 };
      }

      // Parse runContext from --context flag
      let runContext: Record<string, unknown> | undefined;
      if (flags.context) {
        try {
          runContext = JSON.parse(flags.context as string);
        } catch {
          const msg = `Invalid JSON in --context: ${flags.context}`;
          if (isJson) {
            ui?.json?.({ status: 'error', message: msg });
          } else {
            ui?.error?.(msg, { title: 'QA Check Error' });
          }
          return { exitCode: 1 };
        }
      }

      const packages = getWorkspacePackages(rootDir, {}, config?.packages);

      const results = runCustomChecks(
        [checkConfig],
        packages,
        rootDir,
        undefined,
        base,
      );

      const checkResult = results[checkId];
      const hasFailed = checkResult ? checkResult.failed.length > 0 : false;

      // Save to history if requested
      if (shouldSave) {
        const entry = createHistoryEntry(results, rootDir, packages, runContext);
        appendEntry(rootDir, entry, allChecks);
      }

      const severity = checkConfig.severity ?? 'blocker';
      const report = buildJsonReport(results, null, [checkConfig]);

      if (isJson) {
        ui?.json?.(report);
      } else {
        if (hasFailed) {
          const findings = severity === 'warning' ? report.warnings : report.blockers;
          const checkFindings = findings.find(f => f.check === checkId);
          if (checkFindings) {
            ui?.error?.(`Check "${checkId}" failed`, {
              title: `${severity === 'warning' ? '⚠' : '✗'} ${checkId}`,
              sections: [{
                header: '',
                items: checkFindings.items.map(item =>
                  `  ${item.target}: ${item.message}${item.fix ? ` → ${item.fix}` : ''}`
                ),
              }],
            });
          }
        } else {
          ui?.success?.(`Check "${checkId}" passed`, { title: `✓ ${checkId}` });
        }
      }

      // Exit code: blockers fail, warnings pass, info always pass
      const shouldFail = hasFailed && severity === 'blocker';
      return { exitCode: shouldFail ? 1 : 0 };
    },
  },
});
