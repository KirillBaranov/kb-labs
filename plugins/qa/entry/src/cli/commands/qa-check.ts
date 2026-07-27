import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
  type CommandResult,
} from '@kb-labs/sdk';
import {
  DevkitAdapter,
  SnapshotStore,
  resolveDevkitBin,
  captureGit,
  buildCheckReport,
  buildCheckJsonReport,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaCheckFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaCheckFlags>, unknown>({
  id: 'qa:check',
  description: 'Run devkit structural checks',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaCheckFlags>): Promise<CommandResult> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const binaryPath = resolveDevkitBin(cwd, config?.devkitPath);
      const adapter = new DevkitAdapter({ binaryPath, cwd, shell: ctx.api.shell });
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);

      const save = flags.save !== false;
      const git = await captureGit(ctx.api.shell, cwd);

      const start = Date.now();
      const raw = await adapter.check();
      const durationMs = Date.now() - start;

      const snap = save ? store.saveCheck(raw, durationMs, git) : null;
      const effective: import('@kb-labs/qa-contracts').CheckSnapshot = snap ?? {
        kind: 'check', id: '', timestamp: new Date().toISOString(), durationMs, raw,
      };

      if (flags.json) {
        ctx.ui?.json?.(buildCheckJsonReport(effective));
      } else {
        for (const section of buildCheckReport(effective)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return raw.ok ? { ok: true, result: raw } : { ok: false, error: 'QA check failed', result: raw };
    },
  },
});
