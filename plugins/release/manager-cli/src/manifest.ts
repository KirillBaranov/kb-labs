/**
 * KB Labs Release Manager - Manifest V3
 *
 * Migration from V2 to V3 following best practices from V3-MIGRATION-GUIDE.md
 *
 * Key changes:
 * - Schema: kb.plugin/3
 * - Commands use handler#default suffix
 * - Commands have handlerPath field
 * - Permissions moved to manifest level
 * - All imports from @kb-labs/sdk
 */

import {
  defineCommandFlags,
  combinePermissions,
  gitWorkflowPreset,
  kbPlatformPreset,
  npmPublishPreset,
  ciEnvironmentPreset,
} from '@kb-labs/sdk';
import {
  RELEASE_BASE_PATH,
  RELEASE_ROUTES,
  RELEASE_CACHE_PREFIX,
} from '@kb-labs/release-manager-contracts';

/**
 * Build permissions using presets:
 * - gitWorkflow: HOME, USER, GIT_*, SSH_* for git/changelog operations
 * - kbPlatform: KB_* env vars and .kb/ directory
 * - npmPublish: NPM_TOKEN, npm registry access for publishing
 * - ciEnvironment: CI, GITHUB_TOKEN for CI/CD integrations
 * - Custom: KB_RELEASE_*, additional fs paths
 */
const pluginPermissions = combinePermissions()
  .with(gitWorkflowPreset)
  .with(kbPlatformPreset)
  .with(npmPublishPreset)
  .with(ciEnvironmentPreset)
  .withEnv(['KB_RELEASE_*', 'NODE_ENV'])
  .withFs({
    mode: 'readWrite',
    allow: [
      '.kb/release/**',
      'package.json',
      '**/package.json',
      'pnpm-workspace.yaml',
      '**/*.yml',
      '**/*.yaml',
      'CHANGELOG.md',
      '**/CHANGELOG.md',
    ],
    // Note: deny patterns (*.key, *.secret, node_modules) are enforced by platform
  })
  .withShell({
    allow: ['git', 'npm'], // git: timeline/tagging/commits, npm: publish packages
  })
  .withPlatform({
    cache: [RELEASE_CACHE_PREFIX], // Cache namespace prefix for plan/changelog caching
    llm: true,                       // LLM for changelog generation
    analytics: true,                 // Track release events
  })
  .withQuotas({
    timeoutMs: 1800000, // 30 min for complex releases (148 packages)
    memoryMb: 2048,
    cpuMs: 300000, // 5 min CPU time
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/release',
  version: '0.1.0',

  display: {
    name: 'Release Manager',
    description: 'Plan, execute, and audit releases across your workspace.',
    tags: ['release', 'publish', 'versioning'],
  },

  // Platform requirements
  platform: {
    requires: ['storage', 'cache'], // cache required for plan/changelog caching
    optional: ['llm', 'analytics', 'logger'],
  },

  // Setup handler - V3 pattern
  setup: {
    handler: './setup/handler.js#default',
    handlerPath: './setup/handler.js',
    describe: 'Prepare the .kb/release workspace (plans, reports, backups).',
  },

  // CLI commands - V3 format
  cli: {
    commands: [
      // release:plan - Analyze changes and prepare release plan
      {
        id: 'plan',
        group: 'release',
        describe: 'Analyze changes and prepare release plan',
        longDescription: 'Detect modified packages and compute version bumps based on changes',

        handler: './cli/commands/plan.js#default',
        handlerPath: './cli/commands/plan.js',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            default: 'auto',
            description: 'Version bump strategy',
          },
          json: { type: 'boolean', description: 'Print plan as JSON' },
        }),

        examples: [
          'kb release plan',
          'kb release plan --scope packages/*',
          'kb release plan --bump minor',
          'kb release plan --json',
        ],
      },

      // release:run - Execute release process
      {
        id: 'run',
        group: 'release',
        describe: 'Execute release process (plan, check, publish)',
        longDescription: 'Run full release: plan versions, run checks, publish packages',

        handler: './cli/commands/run.js#default',
        handlerPath: './cli/commands/run.js',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope or glob pattern (e.g. @my-org/core, packages/*)' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            default: 'auto',
            description: 'Version bump override (default: auto-detect from commits)',
          },
          strict: { type: 'boolean', description: 'Fail on any check failure' },
          'dry-run': { type: 'boolean', description: 'Simulate release without publishing or tagging' },
          'skip-checks': { type: 'boolean', description: 'Skip pre-release checks' },
          'skip-build': { type: 'boolean', description: 'Skip build step' },
          'skip-verify': { type: 'boolean', description: 'Skip artifact verification (npm pack check)' },
          'no-verify': { type: 'boolean', description: 'Pass --no-verify to git push (bypasses pre-push hooks)' },
          yes: { type: 'boolean', description: 'Skip confirmation prompt — for CI/headless mode' },
          json: { type: 'boolean', description: 'Print result as JSON' },
        }),

        examples: [
          'kb release run',
          'kb release run --dry-run',
          'kb release run --yes',
          'kb release run --yes --no-verify',
          'kb release run --bump minor --yes',
          'kb release run --scope @my-org/core',
          'kb release run --skip-checks --skip-build',
          'kb release run --strict --json',
        ],
      },

      // release:publish - Publish packages to npm
      {
        id: 'publish',
        group: 'release',
        describe: 'Publish packages to npm registry with interactive OTP',
        longDescription: 'Smart npm publish with interactive 2FA support and better UX',

        handler: './cli/commands/publish.js#default',
        handlerPath: './cli/commands/publish.js',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          otp: { type: 'string', description: 'One-time password (optional, will prompt if needed)' },
          'dry-run': { type: 'boolean', description: 'Simulate publish without actually publishing' },
          tag: { type: 'string', description: 'NPM dist-tag (default: latest)' },
          access: {
            type: 'string',
            choices: ['public', 'restricted'] as const,
            description: 'Package access level',
          },
          token: { type: 'string', description: 'NPM auth token (overrides NPM_TOKEN env)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release publish',
          'kb release publish --scope @kb-labs/core',
          'kb release publish --otp 123456',
          'kb release publish --dry-run',
          'kb release publish --tag next --access public',
        ],
      },

      // release:rollback - Rollback last release
      {
        id: 'rollback',
        group: 'release',
        describe: 'Rollback last release',
        longDescription: 'Restore workspace state from backup snapshot',

        handler: './cli/commands/rollback.js#default',
        handlerPath: './cli/commands/rollback.js',

        flags: defineCommandFlags({
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: ['kb release rollback', 'kb release rollback --json'],
      },

      // release:report - Show last release report
      {
        id: 'report',
        group: 'release',
        describe: 'Show last release report',
        longDescription: 'Display the most recent release execution report',

        handler: './cli/commands/report.js#default',
        handlerPath: './cli/commands/report.js',

        flags: defineCommandFlags({
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: ['kb release report', 'kb release report --json'],
      },

      // release:changelog - Generate changelog
      {
        id: 'changelog',
        group: 'release',
        describe: 'Generate changelog from conventional commits',
        longDescription: 'Parse git history and generate changelog with conventional commits support',

        handler: './cli/commands/changelog.js#default',
        handlerPath: './cli/commands/changelog.js',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Filter to specific package' },
          from: { type: 'string', description: 'Start commit/tag' },
          to: { type: 'string', description: 'End commit/tag (default: HEAD)' },
          'since-tag': { type: 'string', description: 'Shorthand for --from <tag>' },
          format: {
            type: 'string',
            choices: ['json', 'md', 'both'] as const,
            default: 'both',
            description: 'Output format',
          },
          level: {
            type: 'string',
            choices: ['compact', 'standard', 'detailed'] as const,
            default: 'standard',
            description: 'Detail level',
          },
          template: {
            type: 'string',
            description:
              'Template name (builtin: corporate, corporate-ai, technical, compact) or custom path',
          },
          'breaking-only': { type: 'boolean', description: 'Show only breaking changes' },
          include: { type: 'string', description: 'Comma-separated types to include' },
          exclude: { type: 'string', description: 'Types to exclude' },
          'workspace-only': { type: 'boolean', description: 'Only workspace changelog' },
          'per-package': { type: 'boolean', description: 'Only per-package changelogs' },
          force: { type: 'boolean', description: 'Skip audit gate' },
          'allow-major': { type: 'boolean', description: 'Allow major bumps for experimental packages' },
          preid: { type: 'string', description: 'Pre-release identifier (rc, beta, alpha)' },
        }),

        examples: [
          'kb release changelog',
          'kb release changelog --from v1.0.0',
          'kb release changelog --format md --level detailed',
          'kb release changelog --template corporate-ai',
          'kb release changelog --template ./my-template.ts',
          'kb release changelog --breaking-only',
        ],
      },

      // release:verify - Validate release readiness
      {
        id: 'verify',
        group: 'release',
        describe: 'Validate release readiness',
        longDescription: 'Validate release readiness via flag gates (packages, breaking changes, commit types)',

        handler: './cli/commands/verify.js#default',
        handlerPath: './cli/commands/verify.js',

        flags: defineCommandFlags({
          'fail-if-empty': { type: 'boolean', description: 'Fail if no version bumps needed' },
          'fail-on-breaking': { type: 'boolean', description: 'Fail if breaking changes detected' },
          'allow-types': {
            type: 'string',
            description: 'Comma-separated types required (e.g., feat,fix)',
          },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release verify',
          'kb release verify --fail-if-empty',
          'kb release verify --allow-types feat,fix',
        ],
      },
    ],
  },

  // REST API routes - V3 format (scope-based architecture)
  rest: {
    basePath: RELEASE_BASE_PATH,
    routes: [
      // GET /scopes - List available release scopes
      {
        method: 'GET',
        path: RELEASE_ROUTES.SCOPES,
        handler: './rest/handlers/scopes-handler.js#default',
        handlerPath: './rest/handlers/scopes-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#ScopesResponseSchema',
        },
      },
      // GET /status - Get release status for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.STATUS,
        handler: './rest/handlers/status-handler.js#default',
        handlerPath: './rest/handlers/status-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#StatusResponseSchema',
        },
      },
      // GET /plan - Get current release plan for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.PLAN,
        handler: './rest/handlers/plan-handler.js#default',
        handlerPath: './rest/handlers/plan-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#PlanInputSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#PlanResponseSchema',
        },
      },
      // POST /generate - Generate release plan (LLM)
      {
        method: 'POST',
        path: RELEASE_ROUTES.GENERATE,
        handler: './rest/handlers/generate-handler.js#default',
        handlerPath: './rest/handlers/generate-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#GeneratePlanRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#GeneratePlanResponseSchema',
        },
        timeoutMs: 120000, // 2 minutes for LLM analysis
      },
      // DELETE /plan - Reset release plan
      {
        method: 'DELETE',
        path: RELEASE_ROUTES.RESET,
        handler: './rest/handlers/reset-handler.js#default',
        handlerPath: './rest/handlers/reset-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#ResetPlanRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#ResetPlanResponseSchema',
        },
      },
      // GET /changelog - Get changelog for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHANGELOG,
        handler: './rest/handlers/changelog-handler.js#default',
        handlerPath: './rest/handlers/changelog-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#ChangelogInputSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#ChangelogResponseSchema',
        },
      },
      // POST /changelog/generate - Generate changelog (LLM)
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHANGELOG_GENERATE,
        handler: './rest/handlers/changelog-generate-handler.js#default',
        handlerPath: './rest/handlers/changelog-generate-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#GenerateChangelogRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#GenerateChangelogResponseSchema',
        },
        timeoutMs: 120000, // 2 minutes for LLM generation
      },
      // POST /changelog/save - Save edited changelog
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHANGELOG_SAVE,
        handler: './rest/handlers/changelog-save-handler.js#default',
        handlerPath: './rest/handlers/changelog-save-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#SaveChangelogRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#SaveChangelogResponseSchema',
        },
      },
      // POST /run - Execute release process
      {
        method: 'POST',
        path: RELEASE_ROUTES.RUN,
        handler: './rest/handlers/run-handler.js#default',
        handlerPath: './rest/handlers/run-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#RunReleaseRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#RunReleaseResponseSchema',
        },
        timeoutMs: 300000, // 5 minutes for release execution
      },
      // GET /report - Get latest release report
      {
        method: 'GET',
        path: RELEASE_ROUTES.REPORT,
        handler: './rest/handlers/report-handler.js#default',
        handlerPath: './rest/handlers/report-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#ReportResponseSchema',
        },
      },
      // GET /history - Get release history
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY,
        handler: './rest/handlers/history-handler.js#default',
        handlerPath: './rest/handlers/history-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryResponseSchema',
        },
      },
      // GET /history/:id/report - Get historical release report
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_REPORT,
        handler: './rest/handlers/history-report-handler.js#default',
        handlerPath: './rest/handlers/history-report-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryReportResponseSchema',
        },
      },
      // GET /history/:id/plan - Get historical release plan
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_PLAN,
        handler: './rest/handlers/history-plan-handler.js#default',
        handlerPath: './rest/handlers/history-plan-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryPlanResponseSchema',
        },
      },
      // GET /history/:id/changelog - Get historical changelog
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_CHANGELOG,
        handler: './rest/handlers/history-changelog-handler.js#default',
        handlerPath: './rest/handlers/history-changelog-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryChangelogResponseSchema',
        },
      },
      // GET /git-timeline - Get git commit timeline and version preview
      {
        method: 'GET',
        path: RELEASE_ROUTES.GIT_TIMELINE,
        handler: './rest/handlers/git-timeline-handler.js#default',
        handlerPath: './rest/handlers/git-timeline-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#GitTimelineResponseSchema',
        },
      },
      // GET /preview - Preview package contents before publish
      {
        method: 'GET',
        path: RELEASE_ROUTES.PREVIEW,
        handler: './rest/handlers/preview-handler.js#default',
        handlerPath: './rest/handlers/preview-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#PreviewResponseSchema',
        },
      },
      // POST /build - Trigger package build
      {
        method: 'POST',
        path: RELEASE_ROUTES.BUILD,
        handler: './rest/handlers/build-handler.js#default',
        handlerPath: './rest/handlers/build-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#BuildRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#BuildResponseSchema',
        },
        timeoutMs: 300000, // 5 minutes for build
      },
      // GET /checklist - Get unified release checklist status
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHECKLIST,
        handler: './rest/handlers/checklist-handler.js#default',
        handlerPath: './rest/handlers/checklist-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#ReleaseChecklistSchema',
        },
      },
      // GET /checks - Get list of configured checks (without running them)
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHECKS,
        handler: './rest/handlers/get-checks-handler.js#default',
        handlerPath: './rest/handlers/get-checks-handler.js',
        output: {
          zod: '@kb-labs/release-manager-contracts#GetChecksResponseSchema',
        },
      },
      // POST /checks/run - Run pre-release checks from kb.config.json release.checks
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHECKS_RUN,
        handler: './rest/handlers/run-checks-handler.js#default',
        handlerPath: './rest/handlers/run-checks-handler.js',
        input: {
          zod: '@kb-labs/release-manager-contracts#RunChecksRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#RunChecksResponseSchema',
        },
        timeoutMs: 600000, // 10 minutes - all checks combined
      },
    ],
  },

  // Studio V2 — Module Federation pages
  studio: {
    version: 2 as const,
    remoteName: 'releasePlugin',
    pages: [
      {
        id: 'release.overview',
        title: 'Release',
        icon: 'RocketOutlined',
        route: '/p/release',
        entry: './ReleasePage',
        order: 1,
      },
    ],
    menus: [
      {
        id: 'release',
        label: 'Release',
        icon: 'RocketOutlined',
        target: 'release.overview',
        order: 60,
      },
    ],
  },

  // Studio widgets (legacy - commented out, using new UI integration)
  // studio_legacy: {
  //   widgets: [
  //     {
  //       id: 'release.plan',
  //       kind: 'infopanel',
  //       title: 'Latest Release Plan',
  //       description: 'Shows the most recent release plan generated via `kb release plan`.',
  //       data: {
  //         source: {
  //           type: 'rest',
  //           routeId: 'plan/latest',
  //           method: 'GET',
  //         },
  //       },
  //       layoutHint: {
  //         w: 4,
  //         h: 5,
  //         minW: 3,
  //         minH: 3,
  //       },
  //     },
  //     {
  //       id: 'release.report',
  //       kind: 'cardlist',
  //       title: 'Release Report',
  //       description: 'Status of the last release execution.',
  //       data: {
  //         source: {
  //           type: 'rest',
  //           routeId: 'report/latest',
  //           method: 'GET',
  //         },
  //       },
  //       options: {
  //         layout: 'list',
  //       },
  //       layoutHint: {
  //         w: 4,
  //         h: 4,
  //         minW: 3,
  //         minH: 3,
  //       },
  //     },
  //   ],
  //   menus: [
  //     {
  //       id: 'release-menu',
  //       label: 'Release',
  //       icon: 'RocketOutlined',
  //       target: '/plugins/release/dashboard',
  //       order: 0,
  //     },
  //     {
  //       id: 'release-dashboard',
  //       label: 'Dashboard',
  //       icon: 'DashboardOutlined',
  //       parentId: 'release-menu',
  //       target: '/plugins/release/dashboard',
  //       order: 1,
  //     },
  //   ],
  //   layouts: [
  //     {
  //       id: 'release.dashboard',
  //       kind: 'grid',
  //       title: 'Release Dashboard',
  //       description: 'Overview of release planning and execution.',
  //       config: {
  //         cols: { sm: 2, md: 4, lg: 6 },
  //         rowHeight: 5,
  //       },
  //     },
  //   ],
  // },

  // Auto-detects kb.config.json section for useConfig()
  // maps to profiles[].products.release in kb.config.json
  configSection: 'release',

  capabilities: ['fs:read', 'fs:write'],

  // V3: Manifest-first permissions using composable presets
  permissions: pluginPermissions,

  // Artifacts
  artifacts: [
    {
      id: 'release.plan.json',
      pathTemplate: '.kb/release/plan.json',
      description: 'Serialized release plan generated by `kb release plan`.',
    },
    {
      id: 'release.report.json',
      pathTemplate: '.kb/release/report.json',
      description: 'Execution report emitted by `kb release run`.',
    },
    {
      id: 'release.changelog.md',
      pathTemplate: '.kb/release/changelog.md',
      description: 'Workspace changelog output produced during release.',
    },
  ],
};

export default manifest;
