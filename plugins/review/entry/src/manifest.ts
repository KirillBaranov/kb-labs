import {
  cmd, group, mergeCliGroups,
  combinePermissions, gitWorkflowPreset, kbPlatformPreset,
} from '@kb-labs/sdk';
import { runFlags } from './commands/flags.js';

const pluginPermissions = combinePermissions()
  .with(gitWorkflowPreset)
  .with(kbPlatformPreset)
  .withFs({ mode: 'read', allow: ['**/*'] })
  .withPlatform({ llm: true, cache: ['review:'], analytics: true })
  .withQuotas({ timeoutMs: 600000, memoryMb: 512 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/review',
  version: '0.1.0',

  display: {
    name: 'AI Review',
    description: 'AI code review with heuristic engines and LLM',
    tags: ['code-review', 'linting', 'ai', 'quality'],
  },

  configSection: 'review',

  platform: {
    requires: ['storage', 'cache'],
    optional: ['llm', 'analytics', 'logger'],
  },

  cli: mergeCliGroups(
    group({ path: 'review', describe: 'AI code review' }, [
      cmd('review run', './commands/run.js#default', 'Run code review analysis')
        .execute()
        .long(
          'Analyzes code using heuristic engines (ESLint, Ruff, etc.) and optionally LLM analyzers. ' +
          'Supports three modes: heuristic (CI, fast), full (local, comprehensive), llm (deep analysis).',
        )
        .flags(runFlags.schema)
        .examples([
          'kb review run',
          'kb review run --mode=full',
          'kb review run --scope=staged',
          'kb review run --preset=typescript-strict',
          'kb review run --files="src/**/*.ts"',
          'kb review run --json',
        ]),
    ]),
  ),

  permissions: pluginPermissions,
};

export default manifest;
