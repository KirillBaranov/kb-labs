/**
 * Release report command
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand, type CLIInput, type CommandResult, type PluginContextV3 } from '@kb-labs/sdk';
import type { ReleaseReport } from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';

interface ReportFlags {
  json?: boolean;
}

type ReleaseReportResult = CommandResult & {
  report?: ReleaseReport;
};

// ── helpers ────────────────────────────────────────────────────────────────

function buildReportSections(report: ReleaseReport): Array<{ header?: string; items: string[] }> {
  const sections: Array<{ header?: string; items: string[] }> = [
    {
      header: 'Summary',
      items: [
        `Timestamp: ${report.ts}`,
        `Stage: ${report.stage}`,
        `Result: ${report.result.ok ? 'SUCCESS' : 'FAILED'}`,
      ],
    },
  ];

  if (report.result.errors && report.result.errors.length > 0) {
    sections.push({ header: 'Errors', items: [...report.result.errors] });
  }

  return sections;
}

function handleReportNotFound(flags: ReportFlags, ctx: PluginContextV3): ReleaseReportResult {
  ctx.platform?.logger?.warn?.('No release report found');
  if (flags.json) {
    ctx.ui?.json?.({ exitCode: 3, meta: { error: 'No release report found' } });
  } else {
    ctx.ui?.error?.(new Error('No release report found. Run "kb release run" first.'));
  }
  return { exitCode: 3, meta: { error: 'No release report found' } };
}

// ── command ────────────────────────────────────────────────────────────────

export default defineCommand({
  id: 'release:report',
  description: 'Show last release report',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ReportFlags>): Promise<ReleaseReportResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);
      const reportPath = join(repoRoot, '.kb', 'release', 'report.json');

      try {
        const reportContent = await readFile(reportPath, 'utf-8');
        const report = JSON.parse(reportContent) as ReleaseReport;

        ctx.platform?.logger?.info?.('Release report completed', {
          stage: report.stage,
          ok: report.result.ok,
        });

        if (flags.json) {
          ctx.ui?.json?.(report);
        } else {
          if (!ctx.ui) { throw new Error('UI not available'); }
          ctx.ui.sideBox({
            title: 'Release Report',
            sections: buildReportSections(report),
            status: report.result.ok ? 'success' : 'error',
          });
        }

        return { exitCode: report.result.ok ? 0 : 1, report };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return handleReportNotFound(flags, ctx);
        }
        throw error;
      }
    },
  },
});
