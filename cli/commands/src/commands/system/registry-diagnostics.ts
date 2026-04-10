/**
 * registry:diagnostics command - Show detailed registry diagnostic report
 *
 * Runs a fresh discovery cycle and displays all diagnostic events
 * grouped by plugin, with severity, codes, and remediation hints.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { getContextCwd } from '@kb-labs/shared-cli-ui';
import {
  createRegistry,
  formatDiagnosticReport,
  type DiagnosticReport,
} from '@kb-labs/core-registry';

type DiagnosticsFlags = {
  json: { type: 'boolean'; description?: string };
  refresh: { type: 'boolean'; description?: string };
};

type DiagnosticsResult = CommandResult & {
  report: DiagnosticReport;
};

export const registryDiagnostics = defineSystemCommand<DiagnosticsFlags, DiagnosticsResult>({
  name: 'diagnostics',
  description: 'Show registry diagnostic report',
  category: 'registry',
  examples: [],
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
    refresh: { type: 'boolean', description: 'Force fresh discovery (ignore cache)' },
  },
  analytics: {
    command: 'registry:diagnostics',
    startEvent: 'REGISTRY_DIAGNOSTICS_STARTED',
    finishEvent: 'REGISTRY_DIAGNOSTICS_FINISHED',
  },
  async handler(ctx, _argv, flags) {
    const cwd = getContextCwd(ctx);

    const registry = await createRegistry({ root: cwd });

    if (flags.refresh) {
      await registry.refresh();
    }

    const report = registry.getDiagnostics();

    await registry.dispose();

    return { ok: report.summary.errors === 0, report };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.ui.info(JSON.stringify(result.report, null, 2));
      return;
    }

    const text = formatDiagnosticReport(result.report);
    ctx.ui.info(text);

    if (result.report.summary.errors > 0) {
      ctx.ui.error(`${result.report.summary.errors} error(s) found — see details above`);
    } else if (result.report.summary.warnings > 0) {
      ctx.ui.warn(`${result.report.summary.warnings} warning(s) — no blockers`);
    } else {
      ctx.ui.success('Registry is healthy — no issues found');
    }
  },
});
