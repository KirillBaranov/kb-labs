export type PluginType = 'plugin' | 'adapter' | 'widget' | 'hook';

export type MarketplaceItem = {
  slug: string;
  name: string;
  type: PluginType;
  version: string;
  author: string;
  authorType: 'official' | 'community';
  description: string;
  longDescription: string;
  tags: string[];
  installCmd: string;
  commands?: string[];
  permissions?: string[];
  envVars?: string[];
  allowedHosts?: string[];
  weeklyDownloads: number;
  stars: number;
  updatedAt: string;
  docs?: string;
};

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // ─── Official Plugins ──────────────────────────────────────────────────
  {
    slug: 'workflow-cli',
    name: 'Workflow CLI',
    type: 'plugin',
    version: '1.0.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Core CLI commands for interacting with the KB Labs Workflow Daemon.',
    longDescription: `The Workflow CLI plugin is the primary interface for managing and executing workflows from the command line. It provides commands to create, run, inspect, and audit workflow executions directly from your terminal or CI/CD pipeline.\n\nBuilt on top of the KB Labs Workflow Daemon, this plugin exposes the full power of the workflow engine through a clean, composable CLI interface.`,
    tags: ['workflow', 'daemon', 'jobs', 'core'],
    installCmd: 'kb marketplace install @kb-labs/workflow-cli',
    commands: ['workflow:run', 'workflow:list', 'workflow:status', 'workflow:logs', 'workflow:cancel', 'workflow:inspect', 'jobs:list', 'jobs:get'],
    permissions: ['fs:read', 'network:outbound'],
    envVars: ['KB_WORKFLOW_URL', 'KB_AUTH_TOKEN'],
    weeklyDownloads: 4820,
    stars: 312,
    updatedAt: '2025-01-15',
  },
  {
    slug: 'commit-generator',
    name: 'Commit Generator',
    type: 'plugin',
    version: '1.2.1',
    author: 'KB Labs',
    authorType: 'official',
    description: 'AI-powered conventional commit generation with two-phase LLM analysis and secrets detection.',
    longDescription: `Generates meaningful conventional commits from your staged changes using LLM analysis. The plugin performs a two-phase analysis: first a fast diff summary, then a full semantic pass if confidence is below threshold.\n\nIncludes built-in secrets detection to prevent accidental exposure of API keys, tokens, and credentials.`,
    tags: ['git', 'ai', 'commits', 'dx'],
    installCmd: 'kb marketplace install @kb-labs/commit-generator',
    commands: ['commit:commit', 'commit:preview', 'commit:push'],
    permissions: ['fs:read', 'shell:git'],
    envVars: ['OPENAI_API_KEY', 'KB_AUTH_TOKEN'],
    weeklyDownloads: 3120,
    stars: 284,
    updatedAt: '2025-01-20',
  },
  {
    slug: 'qa-plugin',
    name: 'QA Plugin',
    type: 'plugin',
    version: '0.9.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Automated quality checks, baseline tracking, and regression detection across your monorepo.',
    longDescription: `Runs comprehensive quality assurance checks across all packages in your workspace: build validation, lint, TypeScript type checking, and tests — all with incremental build support.\n\nTracks metrics over time and automatically detects regressions between runs. Integrates with CI/CD via JSON output mode.`,
    tags: ['qa', 'quality', 'baseline', 'testing', 'ci'],
    installCmd: 'kb marketplace install @kb-labs/qa-plugin',
    commands: ['qa:run', 'qa:save', 'qa:history', 'qa:trends', 'qa:regressions'],
    permissions: ['fs:read', 'fs:write', 'shell:node'],
    weeklyDownloads: 1890,
    stars: 156,
    updatedAt: '2025-01-18',
  },
  {
    slug: 'release-manager',
    name: 'Release Manager',
    type: 'plugin',
    version: '0.8.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Plan, execute, and audit releases across your workspace with changelog generation.',
    longDescription: `Automates the release lifecycle from version bumping to changelog generation and artifact publishing. Supports monorepo releases with selective package publishing and coordinated version management.\n\nIncludes audit trails for every release action and integrates with GitHub Releases and npm registries.`,
    tags: ['release', 'publish', 'versioning', 'changelog'],
    installCmd: 'kb marketplace install @kb-labs/release-manager',
    commands: ['release:plan', 'release:execute', 'release:audit', 'release:rollback'],
    permissions: ['fs:read', 'fs:write', 'network:outbound', 'shell:git'],
    allowedHosts: ['registry.npmjs.org', 'npm.pkg.github.com', 'api.github.com'],
    envVars: ['NPM_TOKEN', 'GITHUB_TOKEN'],
    weeklyDownloads: 2340,
    stars: 198,
    updatedAt: '2025-01-12',
  },
  {
    slug: 'mind-search',
    name: 'Mind Search',
    type: 'plugin',
    version: '1.0.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'AI-powered semantic code search and RAG system for your entire codebase.',
    longDescription: `Mind Search indexes your entire codebase and enables semantic search across it using vector embeddings and hybrid BM25+vector retrieval.\n\nSupports three query modes: instant (fast lookup), auto (balanced), and thinking (deep multi-step analysis). Integrates with the KB Labs agent system for autonomous code exploration.`,
    tags: ['ai', 'search', 'rag', 'embeddings', 'dx'],
    installCmd: 'kb marketplace install @kb-labs/mind-search',
    commands: ['mind:rag-query', 'mind:rag-index', 'mind:stats'],
    permissions: ['fs:read', 'network:outbound'],
    allowedHosts: ['api.openai.com', 'localhost:6333'],
    envVars: ['OPENAI_API_KEY', 'QDRANT_URL'],
    weeklyDownloads: 2670,
    stars: 241,
    updatedAt: '2025-01-22',
  },

  // ─── Adapters ─────────────────────────────────────────────────────────
  {
    slug: 'adapter-github',
    name: 'GitHub Adapter',
    type: 'adapter',
    version: '1.1.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Full GitHub integration — repos, PRs, issues, Actions, and webhooks.',
    longDescription: `Connects KB Labs workflows to GitHub. Trigger workflows from push events, PRs, and issue comments. Read and write to repositories, manage pull requests, and query Actions run status.\n\nSupports GitHub App and Personal Access Token authentication. Works with github.com and GitHub Enterprise Server.`,
    tags: ['github', 'git', 'ci', 'webhooks'],
    installCmd: 'kb marketplace install @kb-labs/adapter-github',
    permissions: ['network:outbound'],
    allowedHosts: ['api.github.com', 'github.com'],
    envVars: ['GITHUB_TOKEN', 'GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY'],
    weeklyDownloads: 5120,
    stars: 389,
    updatedAt: '2025-01-19',
  },
  {
    slug: 'adapter-slack',
    name: 'Slack Adapter',
    type: 'adapter',
    version: '0.9.2',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Send messages, manage channels, and trigger workflows from Slack events.',
    longDescription: `Integrates KB Labs with Slack for two-way communication. Send formatted messages, create threads, react to events, and use Slack as a workflow trigger.\n\nSupports Block Kit for rich message formatting, slash commands, and interactive components.`,
    tags: ['slack', 'notifications', 'messaging', 'webhooks'],
    installCmd: 'kb marketplace install @kb-labs/adapter-slack',
    permissions: ['network:outbound'],
    allowedHosts: ['slack.com', 'hooks.slack.com'],
    envVars: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
    weeklyDownloads: 3890,
    stars: 267,
    updatedAt: '2025-01-14',
  },
  {
    slug: 'adapter-s3',
    name: 'S3 Adapter',
    type: 'adapter',
    version: '1.0.1',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Read, write, and manage objects in S3-compatible storage (AWS S3, R2, MinIO).',
    longDescription: `Provides workflow steps for interacting with S3-compatible object storage. Upload build artifacts, read configuration files, manage data pipelines, and use S3 as a workflow state backend.\n\nCompatible with AWS S3, Cloudflare R2, MinIO, and any S3-compatible API.`,
    tags: ['s3', 'storage', 'aws', 'files'],
    installCmd: 'kb marketplace install @kb-labs/adapter-s3',
    permissions: ['network:outbound'],
    allowedHosts: ['*.amazonaws.com', '*.r2.cloudflarestorage.com'],
    envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_ENDPOINT'],
    weeklyDownloads: 2890,
    stars: 203,
    updatedAt: '2025-01-10',
  },
  {
    slug: 'adapter-postgres',
    name: 'PostgreSQL Adapter',
    type: 'adapter',
    version: '0.7.0',
    author: 'community',
    authorType: 'community',
    description: 'Execute queries, run migrations, and use Postgres as a workflow data store.',
    longDescription: `Enables workflow steps to interact with PostgreSQL databases. Run parameterized queries, execute transactions, manage schema migrations, and stream query results.\n\nBuilt by the community with support for connection pooling and SSL.`,
    tags: ['postgres', 'database', 'sql', 'data'],
    installCmd: 'kb marketplace install @community/adapter-postgres',
    permissions: ['network:outbound'],
    envVars: ['DATABASE_URL', 'PGPASSWORD'],
    weeklyDownloads: 1450,
    stars: 112,
    updatedAt: '2025-01-08',
  },
  {
    slug: 'adapter-linear',
    name: 'Linear Adapter',
    type: 'adapter',
    version: '0.5.1',
    author: 'community',
    authorType: 'community',
    description: 'Sync issues, update project status, and trigger workflows from Linear events.',
    longDescription: `Connect KB Labs to Linear for issue tracking automation. Create and update issues, sync project status, and trigger workflows when issue state changes.\n\nUses the Linear GraphQL API with webhook support for real-time events.`,
    tags: ['linear', 'project-management', 'issues'],
    installCmd: 'kb marketplace install @community/adapter-linear',
    permissions: ['network:outbound'],
    allowedHosts: ['api.linear.app'],
    envVars: ['LINEAR_API_KEY', 'LINEAR_WEBHOOK_SECRET'],
    weeklyDownloads: 890,
    stars: 78,
    updatedAt: '2024-12-28',
  },

  // ─── Widgets ──────────────────────────────────────────────────────────
  {
    slug: 'widget-workflow-status',
    name: 'Workflow Status Board',
    type: 'widget',
    version: '1.0.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Real-time dashboard widget showing live workflow run status and metrics.',
    longDescription: `A Studio dashboard widget that displays active workflow runs, success rates, and execution timelines in real time. Configurable to show runs for specific workflow IDs or all runs.\n\nIncludes sparkline charts for trend visualization and one-click access to run details.`,
    tags: ['studio', 'dashboard', 'monitoring', 'realtime'],
    installCmd: 'kb marketplace install @kb-labs/widget-workflow-status',
    weeklyDownloads: 1230,
    stars: 95,
    updatedAt: '2025-01-17',
  },
  {
    slug: 'widget-log-stream',
    name: 'Log Stream',
    type: 'widget',
    version: '0.8.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Live-streaming log viewer with filtering, search, and ANSI color support.',
    longDescription: `Embeds a full-featured log viewer into Studio dashboards. Streams logs from any running workflow or daemon in real time, with support for regex filtering, ANSI color codes, and log level filtering.\n\nSupports export to plain text or JSON.`,
    tags: ['studio', 'logs', 'debugging', 'monitoring'],
    installCmd: 'kb marketplace install @kb-labs/widget-log-stream',
    weeklyDownloads: 980,
    stars: 74,
    updatedAt: '2025-01-11',
  },

  // ─── Hooks ────────────────────────────────────────────────────────────
  {
    slug: 'hook-pre-deploy',
    name: 'Pre-Deploy Hook',
    type: 'hook',
    version: '0.4.0',
    author: 'KB Labs',
    authorType: 'official',
    description: 'Run validation gates before any workflow deployment — lint, types, tests.',
    longDescription: `A lifecycle hook that runs before any workflow is deployed to the daemon. Executes configurable validation steps: linting, type checking, test suites, and custom scripts.\n\nBlocks deployment if any gate fails, with clear error output and exit codes for CI integration.`,
    tags: ['hooks', 'ci', 'validation', 'deploy'],
    installCmd: 'kb marketplace install @kb-labs/hook-pre-deploy',
    weeklyDownloads: 720,
    stars: 58,
    updatedAt: '2025-01-05',
  },
  {
    slug: 'hook-notify',
    name: 'Notification Hook',
    type: 'hook',
    version: '0.3.0',
    author: 'community',
    authorType: 'community',
    description: 'Send notifications to Slack, email, or webhooks on workflow lifecycle events.',
    longDescription: `Hooks into workflow lifecycle events (start, complete, fail, cancel) and sends notifications to configurable destinations. Supports Slack, email via SMTP, and generic webhooks.\n\nBuilt by the community with template-based message formatting.`,
    tags: ['hooks', 'notifications', 'slack', 'webhooks'],
    installCmd: 'kb marketplace install @community/hook-notify',
    weeklyDownloads: 560,
    stars: 43,
    updatedAt: '2024-12-20',
  },
];

export function getItemBySlug(slug: string): MarketplaceItem | undefined {
  return MARKETPLACE_ITEMS.find((item) => item.slug === slug);
}

export function getFilteredItems(type?: PluginType | 'all', tag?: string): MarketplaceItem[] {
  let items = MARKETPLACE_ITEMS;
  if (type && type !== 'all') {
    items = items.filter((item) => item.type === type);
  }
  if (tag) {
    items = items.filter((item) => item.tags.includes(tag));
  }
  return items;
}

export const TYPE_LABELS: Record<PluginType | 'all', string> = {
  all: 'All',
  plugin: 'Plugins',
  adapter: 'Adapters',
  widget: 'Widgets',
  hook: 'Hooks',
};

export const ALL_TAGS = Array.from(
  new Set(MARKETPLACE_ITEMS.flatMap((item) => item.tags)),
).sort();
