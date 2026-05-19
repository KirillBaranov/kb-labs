import {
  cmd, group, mergeCliGroups, GET, POST,
  combinePermissions, kbPlatformPreset,
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
  schema: 'kb.plugin/3' as const,
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

  cli: mergeCliGroups(
    group({ path: 'quality', describe: 'Code quality, architecture analysis, and trend tracking.', category: 'Overview' }, [
      cmd('quality stats', './cli/commands/stats.js#default', 'Monorepo statistics')
        .read().flags(statsFlags).examples(['kb quality stats', 'kb quality stats --json'])
        .perms(pluginPermissions),

      cmd('quality health', './cli/commands/health.js#default', 'Multidimensional health score (architecture, TypeScript, dead code, deps)')
        .analyze().flags(healthFlags).examples(['kb quality health', 'kb quality health --json', 'kb quality health --detailed'])
        .perms(pluginPermissions),

      cmd('quality snapshot', './cli/commands/snapshot.js#default', 'Collect all metrics and save a snapshot for trend tracking')
        .mutate().flags(snapshotFlags).examples(['kb quality snapshot', 'kb quality snapshot --json'])
        .perms(pluginPermissions),

      cmd('quality history', './cli/commands/history.js#default', 'Show quality snapshot history and delta trends')
        .read().flags(historyFlags).examples(['kb quality history', 'kb quality history --json', 'kb quality history --limit 20'])
        .perms(pluginPermissions),

      cmd('quality context', './cli/commands/context.js#default', 'Package context for agents: layer, dependents, dependencies (fast, stateless)')
        .read().category('Agent').flags(contextFlags)
        .examples(['kb quality context --package @kb-labs/sdk', 'kb quality context --package @kb-labs/sdk --json', 'kb quality context --json'])
        .perms(pluginPermissions),

      cmd('quality gate', './cli/commands/gate.js#default', 'Architecture gate: fail if new layering violations introduced')
        .analyze().category('Agent').flags(gateFlags)
        .examples(['kb quality gate', 'kb quality gate --json', 'kb quality gate --strict'])
        .perms(pluginPermissions),

      cmd('quality dead code', './cli/commands/dead-code.js#default', 'Detect unused files, exports, and deps via knip')
        .analyze().category('Checks').flags(deadCodeFlags)
        .examples(['kb quality dead code', 'kb quality dead code --json'])
        .perms(pluginPermissions),

      cmd('quality visualize', './cli/commands/visualize.js#default', 'Visualize dependency graph')
        .analyze().category('Fixes').flags(visualizeFlags)
        .examples(['kb quality visualize --tree', 'kb quality visualize --dot'])
        .perms(pluginPermissions),

      cmd('quality fix deps', './cli/commands/fix-deps.js#default', 'Auto-fix dependency issues')
        .mutate().category('Fixes').flags(fixDepsFlags)
        .examples(['kb quality fix deps --dry-run', 'kb quality fix deps --all'])
        .perms(pluginPermissions),
    ]),

    group({ path: 'quality check', describe: 'Static analysis checks (layers, types, builds, tests)', category: 'Architecture' }, [
      cmd('quality check layers', './cli/commands/check-layers.js#default', 'Detect layering violations (lower layer importing higher layer)')
        .analyze().flags(checkLayersFlags)
        .examples(['kb quality check layers', 'kb quality check layers --json', 'kb quality check layers --package @kb-labs/plugins-qa'])
        .perms(pluginPermissions),

      cmd('quality coupling', './cli/commands/coupling.js#default', 'Show coupling metrics per package (Ca/Ce/instability)')
        .analyze().flags(couplingFlags)
        .examples(['kb quality coupling', 'kb quality coupling --json', 'kb quality coupling --sort coupled --top 20'])
        .perms(pluginPermissions),

      cmd('quality build order', './cli/commands/build-order.js#default', 'Topological build order')
        .analyze().flags(buildOrderFlags)
        .examples(['kb quality build order', 'kb quality build order --json'])
        .perms(pluginPermissions),

      cmd('quality cycles', './cli/commands/cycles.js#default', 'Detect circular dependencies')
        .analyze().flags(cyclesFlags)
        .examples(['kb quality cycles', 'kb quality cycles --json'])
        .perms(pluginPermissions),

      cmd('quality check types', './cli/commands/check-types.js#default', 'TypeScript type safety analysis (any count, ts-ignore, errors)')
        .analyze().category('Checks').flags(checkTypesFlags)
        .examples(['kb quality check types', 'kb quality check types --json'])
        .perms(heavyPermissions),

      cmd('quality check builds', './cli/commands/check-builds.js#default', 'Build status across monorepo')
        .analyze().category('Checks').flags(checkBuildsFlags)
        .examples(['kb quality check builds', 'kb quality check builds --json'])
        .perms(heavyPermissions),

      cmd('quality check tests', './cli/commands/check-tests.js#default', 'Run tests and track coverage')
        .execute().category('Checks').flags(checkTestsFlags)
        .examples(['kb quality check tests', 'kb quality check tests --with-coverage'])
        .perms(heavyPermissions),
    ]),

    group({ path: 'quality fix', describe: 'Auto-fix quality issues' }, []),
  ),

  rest: {
    basePath: QUALITY_BASE_PATH,
    routes: [
      GET(QUALITY_ROUTES.STATS,         './rest/handlers/stats-handler.js#default'),
      GET(QUALITY_ROUTES.HEALTH,        './rest/handlers/health-handler.js#default'),
      GET(QUALITY_ROUTES.LAYERS,        './rest/handlers/layers-handler.js#default'),
      GET(QUALITY_ROUTES.COUPLING,      './rest/handlers/coupling-handler.js#default'),
      GET(QUALITY_ROUTES.DEAD_CODE,     './rest/handlers/knip-handler.js#default'),
      GET(QUALITY_ROUTES.HISTORY,       './rest/handlers/history-handler.js#default'),
      POST(QUALITY_ROUTES.SNAPSHOT,     './rest/handlers/snapshot-handler.js#default'),
      GET(QUALITY_ROUTES.DEPENDENCIES,  './rest/handlers/dependencies-handler.js#default'),
      GET(QUALITY_ROUTES.BUILD_ORDER,   './rest/handlers/build-order-handler.js#default'),
      GET(QUALITY_ROUTES.CYCLES,        './rest/handlers/cycles-handler.js#default'),
      GET(QUALITY_ROUTES.GRAPH,         './rest/handlers/graph-handler.js#default'),
      GET(QUALITY_ROUTES.STALE,         './rest/handlers/stale-handler.js#default'),
    ],
  },

  studio: {
    version: 2 as const,
    remoteName: 'qualityPlugin',
    pages: [
      { id: 'quality.overview', title: 'Quality', icon: 'CheckCircleOutlined', route: '/p/quality', entry: './QualityOverview', order: 1 },
    ],
    menus: [
      { id: 'quality', label: 'Quality', icon: 'CheckCircleOutlined', target: 'quality.overview', order: 40 },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
