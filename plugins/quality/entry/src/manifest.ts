/**
 * Quality Plugin Manifest V3
 *
 * Monorepo quality analysis and automated fixes
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
} from './cli/commands/flags.js';

/**
 * Build permissions using V3 combinePermissions builder pattern.
 * Quality plugin needs read/write access to entire monorepo for analysis and fixes.
 */
const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: ['**'], // Access to entire monorepo
  })
  .withPlatform({
    cache: ['quality:'],  // Cache namespace prefix
    analytics: true,      // Track command usage
  })
  .withQuotas({
    timeoutMs: 300000,      // 5 minutes for long-running operations
    memoryMb: 1024,         // 1GB memory
  })
  .build();

/**
 * Heavy operations permissions (builds, types, tests)
 * These operations scan the entire monorepo and can take a long time
 */
const heavyOperationsPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: ['**'],
  })
  .withPlatform({
    cache: ['quality:'],
    analytics: true,
  })
  .withQuotas({
    timeoutMs: 600000,      // 10 minutes for heavy operations
    memoryMb: 2048,         // 2GB memory
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/quality',
  version: '0.1.0',

  display: {
    name: 'Quality Tools',
    description: 'Monorepo quality analysis and automated fixes',
    tags: ['quality', 'monorepo', 'analysis', 'devtools'],
  },

  platform: {
    requires: ['storage', 'cache'],
    optional: ['analytics', 'logger'],
  },

  cli: {
    commands: [
      // ======================================================================
      // quality:stats - Monorepo statistics and health score
      // ======================================================================
      {
        id: 'stats',
        group: 'quality',
        describe: 'Get monorepo statistics and health score',
        longDescription:
          'Analyzes monorepo structure, collects package statistics, dependency info, and calculates health score. ' +
          'Results are cached for 5 minutes.',

        handler: './cli/commands/stats.js#default',
        handlerPath: './cli/commands/stats.js',

        flags: defineCommandFlags(statsFlags),

        examples: [
          'kb quality:stats',
          'kb quality:stats --health',
          'kb quality:stats --json',
          'kb quality:stats --md',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:health - Monorepo health check
      // ======================================================================
      {
        id: 'health',
        group: 'quality',
        describe: 'Check monorepo health score',
        longDescription:
          'Analyzes monorepo health including dependency issues, structure problems, and build health. ' +
          'Returns health score (0-100) with grade (A-F) and actionable recommendations.',

        handler: './cli/commands/health.js#default',
        handlerPath: './cli/commands/health.js',

        flags: defineCommandFlags(healthFlags),

        examples: [
          'kb quality:health',
          'kb quality:health --detailed',
          'kb quality:health --package @kb-labs/core',
          'kb quality:health --json',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:fix-deps - Dependency auto-fixer
      // ======================================================================
      {
        id: 'fix-deps',
        group: 'quality',
        describe: 'Auto-fix dependency issues',
        longDescription:
          'Automatically fixes dependency issues including removing unused deps, adding missing workspace deps, ' +
          'and aligning duplicate versions. Supports --dry-run for previewing changes.',

        handler: './cli/commands/fix-deps.js#default',
        handlerPath: './cli/commands/fix-deps.js',

        flags: defineCommandFlags(fixDepsFlags),

        examples: [
          'kb quality:fix-deps --stats',
          'kb quality:fix-deps --remove-unused --dry-run',
          'kb quality:fix-deps --align-versions',
          'kb quality:fix-deps --all --dry-run',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:build-order - Calculate build order with topological sort
      // ======================================================================
      {
        id: 'build-order',
        group: 'quality',
        describe: 'Calculate build order using topological sort',
        longDescription:
          'Analyzes package dependencies and calculates correct build order using topological sort. ' +
          'Shows build layers where each layer can be built in parallel. Detects circular dependencies.',

        handler: './cli/commands/build-order.js#default',
        handlerPath: './cli/commands/build-order.js',

        flags: defineCommandFlags(buildOrderFlags),

        examples: [
          'kb quality:build-order',
          'kb quality:build-order --layers',
          'kb quality:build-order --package @kb-labs/core',
          'kb quality:build-order --script > build.sh',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:cycles - Detect circular dependencies
      // ======================================================================
      {
        id: 'cycles',
        group: 'quality',
        describe: 'Detect circular dependencies',
        longDescription:
          'Uses DFS to find all circular dependency chains in the monorepo. ' +
          'Shows complete dependency cycles with recommendations for breaking them.',

        handler: './cli/commands/cycles.js#default',
        handlerPath: './cli/commands/cycles.js',

        flags: defineCommandFlags(cyclesFlags),

        examples: [
          'kb quality:cycles',
          'kb quality:cycles --json',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:visualize - Visualize dependency graph
      // ======================================================================
      {
        id: 'visualize',
        group: 'quality',
        describe: 'Visualize dependency graph',
        longDescription:
          'Visualize monorepo dependency graph in various formats: tree view, DOT format for graphviz, ' +
          'reverse dependencies (who depends on this), impact analysis (what will be affected by changes), ' +
          'and comprehensive graph statistics.',

        handler: './cli/commands/visualize.js#default',
        handlerPath: './cli/commands/visualize.js',

        flags: defineCommandFlags(visualizeFlags),

        examples: [
          'kb quality:visualize --stats',
          'kb quality:visualize --tree --package @kb-labs/core',
          'kb quality:visualize --reverse --package @kb-labs/sdk',
          'kb quality:visualize --impact --package @kb-labs/core',
          'kb quality:visualize --dot > deps.dot',
        ],

        permissions: pluginPermissions,
      },

      // ======================================================================
      // quality:check-builds - Check build status across monorepo
      // ======================================================================
      {
        id: 'check-builds',
        group: 'quality',
        describe: 'Check build status across monorepo',
        longDescription:
          'Analyzes build status across all packages with build scripts. ' +
          'Detects build failures with error messages and stale builds (dist/ older than src/). ' +
          'Results are cached for 10 minutes.',

        handler: './cli/commands/check-builds.js#default',
        handlerPath: './cli/commands/check-builds.js',

        flags: defineCommandFlags(checkBuildsFlags),

        examples: [
          'kb quality:check-builds',
          'kb quality:check-builds --package @kb-labs/core',
          'kb quality:check-builds --timeout 60000',
          'kb quality:check-builds --json',
          'kb quality:check-builds --refresh',
        ],

        permissions: heavyOperationsPermissions,
      },

      // ======================================================================
      // quality:check-types - TypeScript type safety analysis
      // ======================================================================
      {
        id: 'check-types',
        group: 'quality',
        describe: 'Analyze TypeScript type safety across monorepo',
        longDescription:
          'Analyzes TypeScript type errors, warnings, and type coverage using TypeScript Compiler API. ' +
          'Detects any usage, @ts-ignore comments, and calculates type coverage percentage. ' +
          'Results are cached for 10 minutes.',

        handler: './cli/commands/check-types.js#default',
        handlerPath: './cli/commands/check-types.js',

        flags: defineCommandFlags(checkTypesFlags),

        examples: [
          'kb quality:check-types',
          'kb quality:check-types --package @kb-labs/core',
          'kb quality:check-types --errors-only',
          'kb quality:check-types --json',
          'kb quality:check-types --refresh',
        ],

        permissions: heavyOperationsPermissions,
      },

      // ======================================================================
      // quality:check-tests - Test execution and coverage tracking
      // ======================================================================
      {
        id: 'check-tests',
        group: 'quality',
        describe: 'Run tests and track coverage across monorepo',
        longDescription:
          'Runs tests across all packages with test scripts and collects coverage statistics. ' +
          'Parses test output (vitest/jest) to extract test counts and reads coverage-summary.json. ' +
          'Results are cached for 5 minutes.',

        handler: './cli/commands/check-tests.js#default',
        handlerPath: './cli/commands/check-tests.js',

        flags: defineCommandFlags(checkTestsFlags),

        examples: [
          'kb quality:check-tests',
          'kb quality:check-tests --package @kb-labs/core',
          'kb quality:check-tests --with-coverage',
          'kb quality:check-tests --coverage-only',
          'kb quality:check-tests --timeout 120000',
          'kb quality:check-tests --json',
        ],

        permissions: heavyOperationsPermissions,
      },

      // ======================================================================
      // quality:dead-code - Dead code file detection
      // ======================================================================
      {
        id: 'dead-code',
        group: 'quality',
        describe: 'Detect dead (unreachable) source files',
        longDescription:
          'Analyzes import graph to find source files not reachable from any entry point ' +
          '(package.json, tsup.config.ts, manifest.ts). Supports automated removal with ' +
          'backup and restore capabilities. Zero false positives by design.',

        handler: './cli/commands/dead-code.js#default',
        handlerPath: './cli/commands/dead-code.js',

        flags: defineCommandFlags(deadCodeFlags),

        examples: [
          'kb quality:dead-code',
          'kb quality:dead-code --package @kb-labs/core',
          'kb quality:dead-code --auto-remove --dry-run',
          'kb quality:dead-code --auto-remove',
          'kb quality:dead-code --list-backups',
          'kb quality:dead-code --restore 2026-02-15T10-30-00',
          'kb quality:dead-code --json',
        ],

        permissions: pluginPermissions,
      },
    ],
  },

  // REST API routes
  rest: {
    basePath: QUALITY_BASE_PATH,
    routes: [
      // GET /stats
      {
        method: 'GET',
        path: QUALITY_ROUTES.STATS,
        handler: './rest/handlers/stats-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#StatsRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#StatsResponseSchema',
        },
      },
      // GET /health
      {
        method: 'GET',
        path: QUALITY_ROUTES.HEALTH,
        handler: './rest/handlers/health-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#HealthRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#HealthResponseSchema',
        },
      },
      // GET /dependencies
      {
        method: 'GET',
        path: QUALITY_ROUTES.DEPENDENCIES,
        handler: './rest/handlers/dependencies-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#DependenciesRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#DependenciesResponseSchema',
        },
      },
      // GET /build-order
      {
        method: 'GET',
        path: QUALITY_ROUTES.BUILD_ORDER,
        handler: './rest/handlers/build-order-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#BuildOrderRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#BuildOrderResponseSchema',
        },
      },
      // GET /cycles
      {
        method: 'GET',
        path: QUALITY_ROUTES.CYCLES,
        handler: './rest/handlers/cycles-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#CyclesRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#CyclesResponseSchema',
        },
      },
      // GET /graph
      {
        method: 'GET',
        path: QUALITY_ROUTES.GRAPH,
        handler: './rest/handlers/graph-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#GraphRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#GraphResponseSchema',
        },
      },
      // GET /stale
      {
        method: 'GET',
        path: QUALITY_ROUTES.STALE,
        handler: './rest/handlers/stale-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#StaleRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#StaleResponseSchema',
        },
      },
      // GET /builds
      {
        method: 'GET',
        path: QUALITY_ROUTES.BUILDS,
        handler: './rest/handlers/builds-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#BuildsRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#BuildsResponseSchema',
        },
      },
      // GET /types
      {
        method: 'GET',
        path: QUALITY_ROUTES.TYPES,
        handler: './rest/handlers/types-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#TypesRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#TypesResponseSchema',
        },
      },
      // GET /tests
      {
        method: 'GET',
        path: QUALITY_ROUTES.TESTS,
        handler: './rest/handlers/tests-handler.js#default',
        input: {
          zod: '@kb-labs/quality-contracts#TestsRequestSchema',
        },
        output: {
          zod: '@kb-labs/quality-contracts#TestsResponseSchema',
        },
      },
    ],
  },

  // Studio V2 — Module Federation pages
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
