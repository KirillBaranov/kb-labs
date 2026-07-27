import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineCommand, type CLIInput, type PluginContextV3 , type CommandResult} from '@kb-labs/sdk';
import { analyzeCiReliability, loadCiDossiers } from '@kb-labs/qa-core';
import type { QaCiOverviewFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaCiOverviewFlags>, unknown>({
  id: 'qa:ci-overview',
  description: 'Show a compact CI reliability overview from captured dossiers',
  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaCiOverviewFlags>): Promise<CommandResult> {
      const cwd = ctx.cwd ?? process.cwd();
      const inputPath = resolve(cwd, input.flags.input);
      const dossiers = loadCiDossiers(inputPath);
      if (dossiers.length === 0) {
        ctx.ui?.error?.(`No CI dossiers found under ${inputPath}. Run \`kb qa ci evidence capture\` in CI first.`);
        return { ok: false, error: 'Command failed' };
      }
      const overview = analyzeCiReliability(dossiers);
      if (input.flags.output) {
        const output = resolve(cwd, input.flags.output);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, `${JSON.stringify(overview, null, 2)}\n`);
      }
      if (input.flags.json) {
        ctx.ui?.json?.(overview);
      } else {
        ctx.ui?.success?.(`CI reliability (${overview.runsAnalyzed} run${overview.runsAnalyzed === 1 ? '' : 's'})`, {
          sections: [
            { header: 'Summary', items: [
              `failed runs: ${overview.failedRuns}`,
              `failed before tests: ${overview.failedBeforeTests}`,
              `evidence: ${overview.collection.complete} complete, ${overview.collection.partial} partial`,
              ...(input.flags.output ? [`saved JSON: ${resolve(cwd, input.flags.output)}`] : []),
            ] },
            { header: 'Top findings', items: overview.findings.length > 0
              ? overview.findings.map(finding => `${finding.fingerprint} — ${finding.occurrences} occurrence(s), ${(finding.confidence * 100).toFixed(0)}% confidence; ${finding.affectedJobs.join(', ')}`)
              : ['No failed CI steps in the captured evidence.'] },
            { header: 'Drill down', items: overview.drillDown.runIds.map(runId => `kb qa ci run --run-id ${runId} --json`) },
          ],
        });
      }
      return { ok: true };
    },
  },
});
