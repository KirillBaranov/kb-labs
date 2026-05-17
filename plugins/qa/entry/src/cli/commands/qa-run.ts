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
  buildRunReport,
  buildRunJsonReport,
} from '@kb-labs/qa-core';
import { DEFAULT_TASKS, type QAPluginConfig } from '@kb-labs/qa-contracts';
import type { QaRunFlags } from './flags.js';

export default defineCommand<unknown, CLIInput<QaRunFlags>, { exitCode: number }>({
  id: 'qa:run',
  description: 'Run devkit tasks and record results',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QaRunFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const config = await useConfig<QAPluginConfig>();
      const cwd = ctx.cwd ?? process.cwd();

      const binaryPath = resolveDevkitBin(cwd, config?.devkitPath);
      const adapter = new DevkitAdapter({ binaryPath, cwd, shell: ctx.api.shell });
      const store = new SnapshotStore(cwd, config?.historyMaxEntries);

      const tasks: string[] = flags.tasks
        ? flags.tasks.split(',').map(s => s.trim()).filter(Boolean)
        : config?.defaultTasks?.slice() ?? [...DEFAULT_TASKS];
      const save = flags.save !== false;

      const git = await captureGit(ctx.api.shell, cwd);

      const start = Date.now();
      const raw = await adapter.run(tasks);
      const durationMs = Date.now() - start;

      const snap = save ? store.saveRun(raw, tasks, durationMs, git) : null;
      const effective: import('@kb-labs/qa-contracts').RunSnapshot = snap ?? {
        kind: 'run', id: '', timestamp: new Date().toISOString(), durationMs, tasks, raw,
      };

      if (flags.json) {
        ctx.ui?.json?.(buildRunJsonReport(effective));
      } else {
        for (const section of buildRunReport(effective)) {
          ctx.ui?.success?.(`${section.header}`, { sections: [{ items: section.lines }] });
        }
      }

      return { exitCode: raw.ok ? 0 : 1 };
    },
  },
});
