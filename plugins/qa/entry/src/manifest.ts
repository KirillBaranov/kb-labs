/**
 * QA Plugin Manifest V3
 *
 * Automated quality checks, baseline tracking, and regression detection.
 */

import {
  combinePermissions,
  kbPlatformPreset,
  defineCommandFlags,
} from '@kb-labs/sdk';
import {
  qaRunFlags,
  qaSaveFlags,
  qaHistoryFlags,
  qaTrendsFlags,
  qaRegressionsFlags,
  baselineUpdateFlags,
  baselineStatusFlags,
} from './cli/commands/flags.js';
import {
  QA_BASE_PATH,
  QA_ROUTES,
} from '@kb-labs/qa-contracts';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: ['**'],
  })
  .withPlatform({
    cache: ['qa:'],
    analytics: true,
  })
  .withQuotas({
    timeoutMs: 600000,
    memoryMb: 2048,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/qa',
  version: '0.1.0',

  configSection: 'qa',

  display: {
    name: 'QA Plugin',
    description: 'Automated quality checks, baseline tracking, and regression detection',
    tags: ['qa', 'quality', 'baseline', 'regression', 'testing'],
  },

  platform: {
    requires: ['storage'],
    optional: ['cache', 'analytics', 'logger'],
  },

  cli: {
    commands: [
      {
        id: 'run',
        group: 'qa',
        describe: 'Run all QA checks (build, lint, types, tests)',
        longDescription:
          'Runs comprehensive QA checks across the monorepo: build, lint, type check, and tests. ' +
          'Compares with baseline if available. Supports incremental builds and package filtering.',
        handler: './cli/commands/qa-run.js#default',
        handlerPath: './cli/commands/qa-run.js',
        flags: defineCommandFlags(qaRunFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'save',
        group: 'qa',
        describe: 'Run QA checks and save results to history',
        longDescription:
          'Runs all QA checks and saves the results as a history entry. ' +
          'History is stored in .kb/qa/history.json (max 50 entries).',
        handler: './cli/commands/qa-save.js#default',
        handlerPath: './cli/commands/qa-save.js',
        flags: defineCommandFlags(qaSaveFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'history',
        group: 'qa',
        describe: 'Show QA run history',
        longDescription: 'Displays the QA run history with pass/fail status for each check type.',
        handler: './cli/commands/qa-history.js#default',
        handlerPath: './cli/commands/qa-history.js',
        flags: defineCommandFlags(qaHistoryFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'trends',
        group: 'qa',
        describe: 'Show QA quality trends over time',
        longDescription:
          'Analyzes quality trends by comparing failure counts over a sliding window of history entries.',
        handler: './cli/commands/qa-trends.js#default',
        handlerPath: './cli/commands/qa-trends.js',
        flags: defineCommandFlags(qaTrendsFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'regressions',
        group: 'qa',
        describe: 'Detect regressions since last QA save',
        longDescription:
          'Compares the last two history entries to detect new failures. ' +
          'Exits with code 1 if regressions are found. Use before merging.',
        handler: './cli/commands/qa-regressions.js#default',
        handlerPath: './cli/commands/qa-regressions.js',
        flags: defineCommandFlags(qaRegressionsFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'baseline:update',
        group: 'qa',
        describe: 'Run full QA and save as new baseline',
        longDescription:
          'Runs all QA checks and saves the results as the current baseline. ' +
          'Future qa:run calls will compare against this baseline.',
        handler: './cli/commands/baseline-update.js#default',
        handlerPath: './cli/commands/baseline-update.js',
        flags: defineCommandFlags(baselineUpdateFlags),
        permissions: pluginPermissions,
      },
      {
        id: 'baseline:status',
        group: 'qa',
        describe: 'Show current baseline status',
        longDescription: 'Displays the current baseline snapshot with pass/fail counts per check type.',
        handler: './cli/commands/baseline-status.js#default',
        handlerPath: './cli/commands/baseline-status.js',
        flags: defineCommandFlags(baselineStatusFlags),
        permissions: pluginPermissions,
      },
    ],
  },

  // REST API routes
  rest: {
    basePath: QA_BASE_PATH,
    routes: [
      // GET /summary
      {
        method: 'GET',
        path: QA_ROUTES.SUMMARY,
        handler: './rest/handlers/summary-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QASummaryRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QASummaryResponseSchema',
        },
      },
      // GET /latest
      {
        method: 'GET',
        path: QA_ROUTES.LATEST,
        handler: './rest/handlers/latest-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QALatestRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QALatestResponseSchema',
        },
      },
      // GET /history
      {
        method: 'GET',
        path: QA_ROUTES.HISTORY,
        handler: './rest/handlers/history-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QAHistoryRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QAHistoryResponseSchema',
        },
      },
      // GET /trends
      {
        method: 'GET',
        path: QA_ROUTES.TRENDS,
        handler: './rest/handlers/trends-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QATrendsRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QATrendsResponseSchema',
        },
      },
      // GET /regressions
      {
        method: 'GET',
        path: QA_ROUTES.REGRESSIONS,
        handler: './rest/handlers/regressions-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QARegressionsRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QARegressionsResponseSchema',
        },
      },
      // GET /baseline
      {
        method: 'GET',
        path: QA_ROUTES.BASELINE,
        handler: './rest/handlers/baseline-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QABaselineRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QABaselineResponseSchema',
        },
      },
      // POST /run
      {
        method: 'POST',
        path: QA_ROUTES.RUN,
        handler: './rest/handlers/run-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QARunRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QARunResponseSchema',
        },
      },
      // GET /details — per-package details with error text
      {
        method: 'GET',
        path: QA_ROUTES.DETAILS,
        handler: './rest/handlers/details-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QADetailsRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QADetailsResponseSchema',
        },
      },
      // POST /run/check — run a single check type
      {
        method: 'POST',
        path: QA_ROUTES.RUN_CHECK,
        handler: './rest/handlers/run-check-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QARunCheckRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QARunCheckResponseSchema',
        },
      },
      // POST /baseline/update — update baseline from last run
      {
        method: 'POST',
        path: QA_ROUTES.BASELINE_UPDATE,
        handler: './rest/handlers/baseline-update-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QABaselineUpdateRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QABaselineUpdateResponseSchema',
        },
      },
      // GET /baseline/diff — diff current state vs baseline
      {
        method: 'GET',
        path: QA_ROUTES.BASELINE_DIFF,
        handler: './rest/handlers/baseline-diff-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QABaselineDiffRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QABaselineDiffResponseSchema',
        },
      },
      // GET /packages/:name/timeline — per-package QA timeline
      {
        method: 'GET',
        path: QA_ROUTES.PACKAGE_TIMELINE,
        handler: './rest/handlers/package-timeline-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QAPackageTimelineRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QAPackageTimelineResponseSchema',
        },
      },
      // GET /errors/groups — grouped errors by pattern
      {
        method: 'GET',
        path: QA_ROUTES.ERROR_GROUPS,
        handler: './rest/handlers/error-groups-handler.js#default',
        input: {
          zod: '@kb-labs/qa-contracts#QAErrorGroupsRequestSchema',
        },
        output: {
          zod: '@kb-labs/qa-contracts#QAErrorGroupsResponseSchema',
        },
      },
    ],
  },

  // Studio V2 — Module Federation pages
  studio: {
    version: 2 as const,
    remoteName: 'qaPlugin',
    pages: [
      {
        id: 'qa.overview',
        title: 'QA',
        icon: 'ExperimentOutlined',
        route: '/p/qa',
        entry: './QADashboard',
        order: 1,
      },
    ],
    menus: [
      {
        id: 'qa',
        label: 'QA',
        icon: 'ExperimentOutlined',
        target: 'qa.overview',
        order: 50,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
