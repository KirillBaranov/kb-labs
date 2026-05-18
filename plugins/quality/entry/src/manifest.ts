/**
 * Quality Plugin Manifest V3
 */

import {
  combinePermissions,
  kbPlatformPreset,
  defineCommandFlags,
} from '@kb-labs/sdk';
import {
  QUALITY_BASE_PATH,
  QUALITY_ROUTES,
} from '@kb-labs/quality-contracts';
import {
  statsFlags,
  healthFlags,
  fixDepsFlags,
  buildOrderFlags,
  cyclesFlags,
  visualizeFlags,
  checkBuildsFlags,
  checkTypesFlags,
  checkTestsFlags,
  deadCodeFlags,
  checkLayersFlags,
  couplingFlags,
  snapshotFlags,
  historyFlags,
  contextFlags,
  gateFlags,
} from './cli/commands/flags.js';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({ mode: 'readWrite', allow: ['**'] })
  .withShell({ allow: ['pnpm', 'git'] })
  .withPlatform({ cache: ['quality:'], analytics: true })
  .withQuotas({ timeoutMs: 300_000, memoryMb: 1024 })
  .build();

const heavyPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({ mode: 'readWrite', allow: ['**'] })
  .withShell({ allow: ['pnpm', 'git'] })
  .withPlatform({ cache: ['quality:'], analytics: true })
  .withQuotas({ timeoutMs: 600_000, memoryMb: 2048 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/quality',
  version: '0.1.0',
  configSection: 'quality',

  display: {
    name: 'Quality',
    description: 'Code quality, architecture analysis, and trend tracking',
    tags: ['quality', 'architecture', 'coupling', 'monorepo'],
  },

  platform: {
    requires: ['storage', 'cache'],
    optional: ['analytics', 'logger'],
  },

  cli: {
    groupMeta: [
      { path: 'quality', describe: 'Code quality, architecture analysis, and trend tracking.' },
      { path: 'quality check', describe: 'Static analysis checks (layers, types, builds, tests)' },
      { path: 'quality fix', describe: 'Auto-fix quality issues' },
    ],
    commands: [
      // ── Overview ────────────────────────────────────────────────────────────
      {
        path: 'quality stats',
        category: 'Overview',
        operationType: 'read' as const,
        describe: 'Monorepo statistics',
        handler: './cli/commands/stats.js#default',
        flags: defineCommandFlags(statsFlags),
        examples: ['kb quality stats', 'kb quality stats --json'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality health',
        category: 'Overview',
        operationType: 'analyze' as const,
        describe: 'Multidimensional health score (architecture, TypeScript, dead code, deps)',
        handler: './cli/commands/health.js#default',
        flags: defineCommandFlags(healthFlags),
        examples: ['kb quality health', 'kb quality health --json', 'kb quality health --detailed'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality snapshot',
        category: 'Overview',
        operationType: 'mutate' as const,
        describe: 'Collect all metrics and save a snapshot for trend tracking',
        handler: './cli/commands/snapshot.js#default',
        flags: defineCommandFlags(snapshotFlags),
        examples: ['kb quality snapshot', 'kb quality snapshot --json'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality history',
        category: 'Overview',
        operationType: 'read' as const,
        describe: 'Show quality snapshot history and delta trends',
        handler: './cli/commands/history.js#default',
        flags: defineCommandFlags(historyFlags),
        examples: ['kb quality history', 'kb quality history --json', 'kb quality history --limit 20'],
        permissions: pluginPermissions,
      },

      // ── Agent ────────────────────────────────────────────────────────────────
      {
        path: 'quality context',
        category: 'Agent',
        operationType: 'read' as const,
        describe: 'Package context for agents: layer, dependents, dependencies (fast, stateless)',
        handler: './cli/commands/context.js#default',
        flags: defineCommandFlags(contextFlags),
        examples: [
          'kb quality context --package @kb-labs/sdk',
          'kb quality context --package @kb-labs/sdk --json',
          'kb quality context --json',
        ],
        permissions: pluginPermissions,
      },
      {
        path: 'quality gate',
        category: 'Agent',
        operationType: 'analyze' as const,
        describe: 'Architecture gate: fail if new layering violations introduced',
        handler: './cli/commands/gate.js#default',
        flags: defineCommandFlags(gateFlags),
        examples: [
          'kb quality gate',
          'kb quality gate --json',
          'kb quality gate --strict',
        ],
        permissions: pluginPermissions,
      },

      // ── Architecture ─────────────────────────────────────────────────────────
      {
        path: 'quality check layers',
        category: 'Architecture',
        operationType: 'analyze' as const,
        describe: 'Detect layering violations (lower layer importing higher layer)',
        handler: './cli/commands/check-layers.js#default',
        flags: defineCommandFlags(checkLayersFlags),
        examples: ['kb quality check layers', 'kb quality check layers --json', 'kb quality check layers --package @kb-labs/plugins-qa'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality coupling',
        category: 'Architecture',
        operationType: 'analyze' as const,
        describe: 'Show coupling metrics per package (Ca/Ce/instability)',
        handler: './cli/commands/coupling.js#default',
        flags: defineCommandFlags(couplingFlags),
        examples: ['kb quality coupling', 'kb quality coupling --json', 'kb quality coupling --sort coupled --top 20'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality build order',
        category: 'Architecture',
        operationType: 'analyze' as const,
        describe: 'Topological build order',
        handler: './cli/commands/build-order.js#default',
        flags: defineCommandFlags(buildOrderFlags),
        examples: ['kb quality build order', 'kb quality build order --json'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality cycles',
        category: 'Architecture',
        operationType: 'analyze' as const,
        describe: 'Detect circular dependencies',
        handler: './cli/commands/cycles.js#default',
        flags: defineCommandFlags(cyclesFlags),
        examples: ['kb quality cycles', 'kb quality cycles --json'],
        permissions: pluginPermissions,
      },

      // ── Checks ───────────────────────────────────────────────────────────────
      {
        path: 'quality dead code',
        category: 'Checks',
        operationType: 'analyze' as const,
        describe: 'Detect unused files, exports, and deps via knip',
        handler: './cli/commands/dead-code.js#default',
        flags: defineCommandFlags(deadCodeFlags),
        examples: ['kb quality dead code', 'kb quality dead code --json'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality check types',
        category: 'Checks',
        operationType: 'analyze' as const,
        describe: 'TypeScript type safety analysis (any count, ts-ignore, errors)',
        handler: './cli/commands/check-types.js#default',
        flags: defineCommandFlags(checkTypesFlags),
        examples: ['kb quality check types', 'kb quality check types --json'],
        permissions: heavyPermissions,
      },
      {
        path: 'quality check builds',
        category: 'Checks',
        operationType: 'analyze' as const,
        describe: 'Build status across monorepo',
        handler: './cli/commands/check-builds.js#default',
        flags: defineCommandFlags(checkBuildsFlags),
        examples: ['kb quality check builds', 'kb quality check builds --json'],
        permissions: heavyPermissions,
      },
      {
        path: 'quality check tests',
        category: 'Checks',
        operationType: 'execute' as const,
        describe: 'Run tests and track coverage',
        handler: './cli/commands/check-tests.js#default',
        flags: defineCommandFlags(checkTestsFlags),
        examples: ['kb quality check tests', 'kb quality check tests --with-coverage'],
        permissions: heavyPermissions,
      },
      {
        path: 'quality fix deps',
        category: 'Fixes',
        operationType: 'mutate' as const,
        describe: 'Auto-fix dependency issues',
        handler: './cli/commands/fix-deps.js#default',
        flags: defineCommandFlags(fixDepsFlags),
        examples: ['kb quality fix deps --dry-run', 'kb quality fix deps --all'],
        permissions: pluginPermissions,
      },
      {
        path: 'quality visualize',
        category: 'Fixes',
        operationType: 'analyze' as const,
        describe: 'Visualize dependency graph',
        handler: './cli/commands/visualize.js#default',
        flags: defineCommandFlags(visualizeFlags),
        examples: ['kb quality visualize --tree', 'kb quality visualize --dot'],
        permissions: pluginPermissions,
      },
    ],
  },

  rest: {
    basePath: QUALITY_BASE_PATH,
    routes: [
      { method: 'GET', path: QUALITY_ROUTES.STATS, handler: './rest/handlers/stats-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.HEALTH, handler: './rest/handlers/health-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.LAYERS, handler: './rest/handlers/layers-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.COUPLING, handler: './rest/handlers/coupling-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.DEAD_CODE, handler: './rest/handlers/knip-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.HISTORY, handler: './rest/handlers/history-handler.js#default' },
      { method: 'POST', path: QUALITY_ROUTES.SNAPSHOT, handler: './rest/handlers/snapshot-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.DEPENDENCIES, handler: './rest/handlers/dependencies-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.BUILD_ORDER, handler: './rest/handlers/build-order-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.CYCLES, handler: './rest/handlers/cycles-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.GRAPH, handler: './rest/handlers/graph-handler.js#default' },
      { method: 'GET', path: QUALITY_ROUTES.STALE, handler: './rest/handlers/stale-handler.js#default' },
    ],
  },

  studio: {
    version: 2 as const,
    remoteName: 'qualityPlugin',
    pages: [
      {
        id: 'quality.overview',
        title: 'Quality',
        icon: 'CheckCircleOutlined',
        route: '/p/quality',
        entry: './QualityOverview',
        order: 1,
      },
    ],
    menus: [
      {
        id: 'quality',
        label: 'Quality',
        icon: 'CheckCircleOutlined',
        target: 'quality.overview',
        order: 40,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
