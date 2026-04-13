/**
 * KB Labs AI Review Plugin - Manifest V3
 */

import {
  defineCommandFlags,
  combinePermissions,
  gitWorkflowPreset,
  kbPlatformPreset,
} from '@kb-labs/sdk';
import { runFlags } from './commands/flags.js';

/**
 * Build permissions:
 * - gitWorkflow: HOME, USER, GIT_* for git operations
 * - kbPlatform: KB_* env vars and .kb/ directory
 * - Custom: file read access, LLM, cache, analytics
 */
const pluginPermissions = combinePermissions()
  .with(gitWorkflowPreset)
  .with(kbPlatformPreset)
  .withFs({
    mode: 'read',
    allow: ['**/*'],
  })
  .withPlatform({
    llm: true,              // LLM for full/llm modes
    cache: ['review:'],     // Cache namespace prefix
    analytics: true,        // Track review events
  })
  .withQuotas({
    timeoutMs: 600000, // 10 min for deep analysis
    memoryMb: 512,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/review',
  version: '0.1.0',

  display: {
    name: 'AI Review',
    description: 'AI-powered code review with heuristic engines (ESLint, Ruff, etc.) and LLM analyzers.',
    tags: ['code-review', 'linting', 'ai', 'quality'],
  },

  // Configuration section in kb.config.json
  configSection: 'review',

  // Platform requirements
  platform: {
    requires: ['storage', 'cache'],
    optional: ['llm', 'analytics', 'logger'],
  },

  // CLI commands
  cli: {
    commands: [
      {
        id: 'run',
        group: 'review',
        describe: 'Run code review analysis',
        longDescription:
          'Analyzes code using heuristic engines (ESLint, Ruff, etc.) and optionally LLM analyzers. ' +
          'Supports three modes: heuristic (CI, fast), full (local, comprehensive), llm (deep analysis).',

        handler: './commands/run.js#default',
        handlerPath: './commands/run.js',

        flags: defineCommandFlags(runFlags.schema),

        examples: [
          'kb review run',
          'kb review run --mode=full',
          'kb review run --scope=staged',
          'kb review run --preset=typescript-strict',
          'kb review run --files="src/**/*.ts"',
          'kb review run --json',
        ],
      },
    ],
  },

  // Permissions
  permissions: pluginPermissions,
};

export default manifest;
