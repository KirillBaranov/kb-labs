import {
  defineCommand,
  useConfig,
  type CLIInput,
  type PluginContextV3,
} from '@kb-labs/sdk';
import {
  DevkitAdapter,
  SnapshotStore,
  resolveDevkitBin,
  captureGit,
} from '@kb-labs/qa-core';
import { type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaGateFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaGateFlags>, { exitCode: number }>({
  id: 'qa:gate',
  description: 'Run pre-commit gate check (exits 1 if violations found)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaGateFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const binaryPath = resolveDevkitBin(cwd, config?.devkitPath);
      const adapter = new DevkitAdapter({ binaryPath, cwd, shell: ctx.api.shell });
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);

      const git = await captureGit(ctx.api.shell, cwd);

      const start = Date.now();
      const raw = await adapter.gate();
      const durationMs = Date.now() - start;

      if (flags.save) store.saveGate(raw, durationMs, git);

      if (flags.json) {
        ctx.ui?.json?.(raw);
      } else if (raw.ok) {
        ctx.ui?.success?.(`Gate passed. ${raw.staged_files} staged file(s), no violations.`);
      } else {
        const items = raw.violations.map(v => `[${v.severity}] ${v.package}  ${v.check}: ${v.message}`);
        ctx.ui?.error?.('Gate failed', { sections: [{ header: 'Violations', items }] });
      }

      return { exitCode: raw.ok ? 0 : 1 };
    },
  },
});
