import {
  cmd, group, mergeCliGroups, GET, POST,
  combinePermissions, kbPlatformPreset,
} from '@kb-labs/sdk';
import {
  qaRunFlags,
  qaCheckFlags,
  qaStatsFlags,
  qaGateFlags,
  qaHistoryFlags,
  qaTrendsFlags,
  qaRegressionsFlags,
  baselineUpdateFlags,
  baselineStatusFlags,
  baselineDiffFlags,
} from './cli/commands/flags.js';
import { QA_BASE_PATH, QA_ROUTES } from '@kb-labs/qa-contracts';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({ mode: 'readWrite', allow: ['**'] })
  .withShell({ allow: ['kb-devkit', 'git'] })
  .withPlatform({ analytics: true })
  .withQuotas({ timeoutMs: 600_000, memoryMb: 512 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/qa',
  version: '0.1.0',

  configSection: 'qa',

  display: {
    name: 'QA Plugin',
    description: 'Smart wrapper around kb-devkit — history, trends, baseline diffing, and health UI',
    tags: ['qa', 'quality', 'baseline', 'regression', 'devkit'],
  },

  platform: {
    requires: [],
    optional: ['cache', 'analytics', 'logger'],
  },

  cli: mergeCliGroups(
    group({ path: 'qa', describe: 'Quality assurance powered by kb-devkit', category: 'Run' }, [
      cmd('qa run', './cli/commands/qa-run.js#default', 'Run devkit tasks and record results')
        .execute().flags(qaRunFlags.schema).perms(pluginPermissions),

      cmd('qa check', './cli/commands/qa-check.js#default', 'Run devkit structural checks')
        .analyze().flags(qaCheckFlags.schema).perms(pluginPermissions),

      cmd('qa stats', './cli/commands/qa-stats.js#default', 'Show devkit health score and category breakdown')
        .read().flags(qaStatsFlags.schema).perms(pluginPermissions),

      cmd('qa gate', './cli/commands/qa-gate.js#default', 'Run pre-commit gate check (exits 1 if violations found)')
        .analyze().flags(qaGateFlags.schema).perms(pluginPermissions),

      cmd('qa history', './cli/commands/qa-history.js#default', 'Show QA run history')
        .read().category('History').flags(qaHistoryFlags.schema).perms(pluginPermissions),

      cmd('qa trends', './cli/commands/qa-trends.js#default', 'Show QA quality trends over time')
        .read().category('History').flags(qaTrendsFlags.schema).perms(pluginPermissions),

      cmd('qa regressions', './cli/commands/qa-regressions.js#default', 'Detect regressions since last run')
        .read().category('History').flags(qaRegressionsFlags.schema).perms(pluginPermissions),
    ]),

    group({ path: 'qa baseline', describe: 'Baseline management', category: 'Baseline' }, [
      cmd('qa baseline update', './cli/commands/baseline-update.js#default', 'Run check + stats and save as new baseline')
        .mutate().flags(baselineUpdateFlags.schema).perms(pluginPermissions),

      cmd('qa baseline status', './cli/commands/baseline-status.js#default', 'Show current baseline')
        .read().flags(baselineStatusFlags.schema).perms(pluginPermissions),

      cmd('qa baseline diff', './cli/commands/baseline-diff.js#default', 'Diff current state against baseline')
        .read().flags(baselineDiffFlags.schema).perms(pluginPermissions),
    ]),
  ),

  rest: {
    basePath: QA_BASE_PATH,
    routes: [
      GET(QA_ROUTES.SUMMARY,          './rest/handlers/summary-handler.js#default'),
      POST(QA_ROUTES.RUN,             './rest/handlers/run-handler.js#default'),
      POST(QA_ROUTES.CHECK,           './rest/handlers/check-handler.js#default'),
      GET(QA_ROUTES.STATS,            './rest/handlers/stats-handler.js#default'),
      POST(QA_ROUTES.GATE,            './rest/handlers/gate-handler.js#default'),
      GET(QA_ROUTES.HISTORY,          './rest/handlers/history-handler.js#default'),
      GET(QA_ROUTES.TRENDS,           './rest/handlers/trends-handler.js#default'),
      GET(QA_ROUTES.REGRESSIONS,      './rest/handlers/regressions-handler.js#default'),
      GET(QA_ROUTES.BASELINE,         './rest/handlers/baseline-handler.js#default'),
      POST(QA_ROUTES.BASELINE_UPDATE, './rest/handlers/baseline-update-handler.js#default'),
      GET(QA_ROUTES.BASELINE_DIFF,    './rest/handlers/baseline-diff-handler.js#default'),
      GET(QA_ROUTES.PACKAGE_TIMELINE, './rest/handlers/package-timeline-handler.js#default'),
      GET(QA_ROUTES.TASKS,            './rest/handlers/tasks-handler.js#default'),
    ],
  },

  studio: {
    version: 2 as const,
    remoteName: 'qaPlugin',
    pages: [
      { id: 'qa.overview', title: 'QA', icon: 'ExperimentOutlined', route: '/p/qa', entry: './QADashboard', order: 1 },
    ],
    menus: [
      { id: 'qa', label: 'QA', icon: 'ExperimentOutlined', target: 'qa.overview', order: 50 },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
