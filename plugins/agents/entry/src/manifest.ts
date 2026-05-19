import {
  cmd, group, mergeCliGroups, GET, POST,
  combinePermissions, kbPlatformPreset,
} from '@kb-labs/sdk';
import {
  AGENTS_BASE_PATH,
  AGENTS_WS_BASE_PATH,
  AGENTS_ROUTES,
  AGENTS_WS_CHANNELS,
} from '@kb-labs/agent-contracts';

const runFlags = {
  task:        { type: 'string',  description: 'Task description' },
  mode:        { type: 'string',  description: 'Agent mode: execute (default), plan, edit, debug', default: 'execute' },
  'session-id':{ type: 'string',  description: 'Session ID (auto-generated if not provided)' },
  complexity:  { type: 'string',  description: 'Task complexity (for plan mode): simple, medium, complex' },
  approve:     { type: 'boolean', description: 'Auto-approve generated plan (supported with --mode=plan)', default: false },
  execute:     { type: 'boolean', description: 'After plan is approved, immediately execute it (use with --mode=plan --approve)', default: false },
  files:       { type: 'array',   description: 'Target files (for edit mode)' },
  trace:       { type: 'string',  description: 'Trace file path (for debug mode)' },
  'dry-run':   { type: 'boolean', description: 'Preview changes without applying (for edit mode)', default: false },
  verbose:     { type: 'boolean', description: 'Verbose output', default: false },
  debug:       { type: 'boolean', description: 'Enable debug mode: emit full prompts and responses as llm:debug events', default: false },
  timeout:     { type: 'number',  description: 'Abort agent execution after this many seconds (exit code 124). No timeout by default.' },
  budget:      { type: 'number',  description: 'Override token budget (e.g. 300000 for heavy tasks). Overrides config value.' },
  json:        { type: 'boolean', description: 'Output structured JSON result instead of human-readable output.' },
} as const;

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({ mode: 'readWrite', allow: ['.agent-memory/**', '**/*'] })
  .withPlatform({ llm: true, cache: ['agent:'], analytics: true })
  .withQuotas({ timeoutMs: 1800000, memoryMb: 1024 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/agent',
  version: '0.1.0',

  display: {
    name: 'Agent System',
    description: 'Autonomous agents, tool calling, and task orchestration',
    tags: ['agent', 'autonomous', 'llm', 'orchestration'],
  },

  configSection: 'agents',

  platform: {
    requires: ['llm'],
    optional: ['cache', 'analytics', 'logger'],
  },

  cli: mergeCliGroups(
    group({ path: 'agent', describe: 'Autonomous agent commands', category: 'Run' }, [
      cmd('agent run', './cli/commands/run.js#default', 'Run agent task (execute, plan, edit, or debug)')
        .execute()
        .long(
          'Unified agent command with multiple modes: ' +
          'execute (default) - run task immediately, ' +
          'plan - generate execution plan without running, ' +
          'edit - modify existing files, ' +
          'debug - analyze errors with trace context. ' +
          'Supports filesystem, search, shell, memory, and user interaction tools.',
        )
        .flags(runFlags)
        .examples([
          'kb agent run --task="Create analytics system"',
          'kb agent run --mode=plan --task="Add auth" --complexity=complex',
          'kb agent run --mode=plan --task="Add auth" --approve',
          'kb agent run --mode=plan --task="Add auth" --approve --execute',
          'kb agent run --mode=edit --task="Fix bug" --files src/auth.ts',
          'kb agent run --mode=debug --task="Why crash?" --trace .kb/traces/trace-123.json',
          'kb agent run --task="Refactor auth module" --timeout=120',
        ]),

      cmd('agent history', './cli/commands/history.js#default', 'Show file change history for agent sessions')
        .read()
        .category('History')
        .long(
          'View file changes made by agents during execution. ' +
          'Filter by session, file, or agent. Shows timestamps, operations, and change metadata.',
        )
        .flags({
          'session-id': { type: 'string',  description: 'Session ID to filter by' },
          file:         { type: 'string',  description: 'File path to filter by' },
          'agent-id':   { type: 'string',  description: 'Agent ID to filter by' },
          json:         { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples([
          'kb agent history',
          'kb agent history --session-id=session-123',
          'kb agent history --file=src/index.ts',
          'kb agent history --agent-id=agent-abc --json',
        ]),

      cmd('agent diff', './cli/commands/diff.js#default', 'Show diff for specific file change')
        .read()
        .category('History')
        .long('Display line-by-line diff for a specific file change. Shows additions, deletions, and modifications with context.')
        .flags({
          'change-id': { type: 'string',  description: 'Change ID to show diff for' },
          json:        { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples(['kb agent diff --change-id=change-abc123', 'kb agent diff --change-id=change-abc123 --json']),

      cmd('agent rollback', './cli/commands/rollback.js#default', 'Rollback file changes made by agents')
        .mutate()
        .category('History')
        .long(
          'Rollback file changes made by agents. ' +
          'Supports rollback by change ID, file path, agent ID, session, or timestamp. ' +
          'Use --dry-run to preview changes before applying.',
        )
        .flags({
          'change-id':  { type: 'string',  description: 'Change ID to rollback' },
          file:         { type: 'string',  description: 'File path to rollback all changes for' },
          'agent-id':   { type: 'string',  description: 'Agent ID to rollback all changes by' },
          'session-id': { type: 'string',  description: 'Session ID to rollback all changes in' },
          after:        { type: 'string',  description: 'Rollback all changes after timestamp (ISO 8601)' },
          force:        { type: 'boolean', description: 'Force rollback even with conflicts', default: false },
          'dry-run':    { type: 'boolean', description: 'Preview rollback without applying', default: false },
          json:         { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples([
          'kb agent rollback --change-id=change-abc123',
          'kb agent rollback --file=src/index.ts --dry-run',
          'kb agent rollback --agent-id=agent-abc',
          'kb agent rollback --session-id=session-123',
          'kb agent rollback --after="2026-02-16T10:00:00Z" --json',
        ]),
    ]),

    group({ path: 'agent trace', describe: 'Agent trace debugging commands', category: 'Trace' }, [
      cmd('agent trace stats', './cli/commands/trace-stats.js#default', 'Show trace statistics: tokens, cost, timing')
        .read()
        .long(
          'Analyze trace file to show comprehensive statistics: ' +
          'iterations, LLM calls, token usage, tool usage, timing, and cost. ' +
          'Supports --json flag for AI agent consumption.',
        )
        .flags({
          'task-id': { type: 'string',  description: 'Task ID or trace filename' },
          json:      { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples(['kb agent trace stats --task-id=task-2026-01-29', 'kb agent trace stats --task-id=task-123 --json']),

      cmd('agent trace filter', './cli/commands/trace-filter.js#default', 'Filter trace events by type for debugging')
        .read()
        .long(
          'Filter trace events by type (llm:call, tool:execution, error:captured, etc.). ' +
          'Use this to debug specific aspects of agent execution. ' +
          'Supports --json flag for programmatic access.',
        )
        .flags({
          'task-id': { type: 'string',  description: 'Task ID or trace filename' },
          type:      { type: 'string',  description: 'Event type to filter (llm:call, tool:execution, etc.)' },
          json:      { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples([
          'kb agent trace filter --task-id=task-123 --type=llm:call',
          'kb agent trace filter --task-id=task-123 --type=error:captured --json',
        ]),

      cmd('agent trace iteration', './cli/commands/trace-iteration.js#default', 'View all events for a specific iteration')
        .read()
        .long(
          'Show all trace events for a specific iteration number. ' +
          'Useful for debugging what happened in a particular loop iteration. ' +
          'Includes summary statistics and event timeline.',
        )
        .flags({
          'task-id':  { type: 'string',  description: 'Task ID or trace filename' },
          iteration:  { type: 'number',  description: 'Iteration number (1-based)' },
          json:       { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples([
          'kb agent trace iteration --task-id=task-123 --iteration=3',
          'kb agent trace iteration --task-id=task-123 --iteration=5 --json',
        ]),

      cmd('agent trace context', './cli/commands/trace-context.js#default', 'Inspect context window and truncations per iteration')
        .read()
        .long(
          'Shows the full context timeline for debugging agent behavior. ' +
          'For each LLM call: what messages are in the sliding window, ' +
          'what was truncated/dropped, and what the LLM responded with.',
        )
        .flags({
          'task-id':  { type: 'string',  description: 'Task ID or trace filename' },
          iteration:  { type: 'number',  description: 'Filter to specific iteration' },
          json:       { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples([
          'kb agent trace context --task-id=task-123',
          'kb agent trace context --task-id=task-123 --iteration=3',
          'kb agent trace context --task-id=task-123 --json',
        ]),

      cmd('agent trace diagnose', './cli/commands/trace-diagnose.js#default', 'Diagnose what went wrong in an agent run')
        .analyze()
        .long(
          'Comprehensive diagnostic report for agent execution. ' +
          'Analyzes errors, context window health (drops, truncations), ' +
          'tool failures, LLM reasoning text, loop detection, and quality indicators. ' +
          'One command to understand any agent issue.',
        )
        .flags({
          'task-id': { type: 'string',  description: 'Task ID or trace filename' },
          json:      { type: 'boolean', description: 'Output JSON for AI agents', default: false },
        })
        .examples(['kb agent trace diagnose --task-id=task-123', 'kb agent trace diagnose --task-id=task-123 --json']),
    ]),

    group({ path: 'agent quality', describe: 'Agent quality control commands', category: 'Quality' }, [
      cmd('agent quality report', './cli/commands/quality-report.js#default', 'Show quality control report for recent agent runs')
        .analyze()
        .long(
          'Aggregates agent KPI telemetry from analytics buffer and shows ' +
          'quality, token usage, tool efficiency, drift, and regression alerts. ' +
          'Useful for continuous quality control and cost/performance monitoring.',
        )
        .flags({
          days:        { type: 'number',  description: 'Lookback period in days', default: 1 },
          limit:       { type: 'number',  description: 'Max KPI runs to analyze', default: 200 },
          'session-id':{ type: 'string',  description: 'Filter by session ID' },
          json:        { type: 'boolean', description: 'Output JSON for automation', default: false },
        })
        .examples([
          'kb agent quality report',
          'kb agent quality report --days=7',
          'kb agent quality report --session-id=session-123',
          'kb agent quality report --days=3 --json',
        ]),
    ]),
  ),

  capabilities: [],

  permissions: pluginPermissions,

  rest: {
    basePath: AGENTS_BASE_PATH,
    defaults: {
      timeoutMs: 1800000,
    },
    routes: [
      POST(AGENTS_ROUTES.RUN,                  './rest/handlers/run-handler.js',                    { description: 'Start a new agent run', security: ['none'] }),
      GET(AGENTS_ROUTES.RUN_STATUS,            './rest/handlers/status-handler.js',                 { description: 'Get status of a run', security: ['none'] }),
      POST(AGENTS_ROUTES.CORRECT,              './rest/handlers/correct-handler.js',                { description: 'Send correction to running agent(s)', security: ['none'] }),
      POST(AGENTS_ROUTES.STOP,                 './rest/handlers/stop-handler.js',                   { description: 'Stop a running agent', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSIONS_LIST,         './rest/handlers/list-sessions-handler.js',          { description: 'List all sessions', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_GET,           './rest/handlers/get-session-handler.js',            { description: 'Get session details', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_CREATE,       './rest/handlers/create-session-handler.js',         { description: 'Create a new session', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_TURNS,         './rest/handlers/get-session-turns-handler.js',      { description: 'Get session turns (turn-based UI)', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_PLAN_GET,      './rest/handlers/get-session-plan-handler.js',       { description: 'Get current session plan', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_PLAN_APPROVE, './rest/handlers/approve-session-plan-handler.js',   { description: 'Approve current session plan', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_PLAN_EXECUTE, './rest/handlers/execute-session-plan-handler.js',   { description: 'Execute approved session plan', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_PLAN_SPEC,    './rest/handlers/generate-spec-handler.js',          { description: 'Generate detailed spec from approved plan', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_PLAN_SPEC_GET, './rest/handlers/get-spec-handler.js',               { description: 'Get current session spec', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_CHANGES,       './rest/handlers/list-file-changes-handler.js',      { description: 'List file changes for session (optionally filtered by runId)', security: ['none'] }),
      GET(AGENTS_ROUTES.SESSION_CHANGE_DIFF,   './rest/handlers/get-file-diff-handler.js',          { description: 'Get unified diff for a specific file change', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_ROLLBACK,     './rest/handlers/rollback-handler.js',               { description: 'Rollback file changes for a session/run', security: ['none'] }),
      POST(AGENTS_ROUTES.SESSION_APPROVE,      './rest/handlers/approve-handler.js',                { description: 'Approve file changes for a session/run', security: ['none'] }),
    ],
  },

  ws: {
    basePath: AGENTS_WS_BASE_PATH,
    defaults: {
      auth: 'none',
      idleTimeoutMs: 3600000,
    },
    channels: [
      {
        path: AGENTS_WS_CHANNELS.SESSION_STREAM,
        description: 'Persistent session stream (all runs in session)',
        handler: './ws/session-stream-handler.js',
        auth: 'none',
      },
    ],
  },

  artifacts: [
    {
      id: 'agent.memory.json',
      pathTemplate: '.agent-memory/memory.json',
      description: 'Persistent agent memory (facts, sessions, project context).',
    },
  ],

  studio: {
    version: 2 as const,
    remoteName: 'agentPlugin',
    pages: [
      { id: 'agent.overview', title: 'Agent', icon: 'RobotOutlined', route: '/p/agent', entry: './AgentsPage', order: 1 },
    ],
    menus: [
      { id: 'agent', label: 'Agent', icon: 'RobotOutlined', target: 'agent.overview', order: 30 },
    ],
  },
};
