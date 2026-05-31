/**
 * KB Labs Mind Plugin — Manifest (kb.plugin/3)
 *
 * Phase 0 placeholder: discovered and built, but exposes no commands/routes yet.
 * CLI commands, REST routes and Studio pages are filled in across later phases.
 *
 * All imports come from `@kb-labs/sdk` only — no platform internals.
 */

import {
  combinePermissions,
  kbPlatformPreset,
  defineCommandFlags,
} from '@kb-labs/sdk';
import {
  MIND_BASE_PATH,
  MIND_ROUTES,
  indexFlags,
  searchFlags,
  queryFlags,
  statusFlags,
  syncPathsFlags,
  syncListFlags,
  reindexFlags,
} from '@kb-labs/mind-contracts';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    // Distinct from old `@kb-labs/mind` (.kb/mind/**) so the two coexist
    // during development; renamed to .kb/mind/** at the Phase 6 swap.
    allow: ['.kb/mind/**'],
  })
  .withPlatform({
    llm: true,
    embeddings: true,
    vectorStore: { collections: ['mind:'] },
    cache: ['mind:'],
    analytics: true,
  })
  .withQuotas({
    timeoutMs: 600000,
    memoryMb: 512,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/mind',
  version: '0.1.0',
  configSection: 'mind',

  display: {
    name: 'Mind (RAG)',
    description: 'Retrieval-augmented knowledge engine — index and query your codebase and docs',
    tags: ['rag', 'search', 'embeddings', 'ai', 'mind'],
  },

  platform: {
    requires: ['cache', 'storage'],
    optional: ['llm', 'embeddings', 'vectorStore', 'analytics'],
  },

  permissions: pluginPermissions,

  cli: {
    groupMeta: [{ path: 'mind', describe: 'Mind — RAG index & search' }],
    commands: [
      {
        path: 'mind index',
        category: 'Index',
        operationType: 'mutate' as const,
        describe: 'Build or refresh a Mind index from source files.',
        handler: './cli/commands/index.js#default',
        flags: defineCommandFlags(indexFlags),
        examples: ['kb mind index', 'kb mind index --index code --scope src/'],
      },
      {
        path: 'mind search',
        category: 'Query',
        operationType: 'read' as const,
        describe: 'Semantic + keyword search over a Mind index.',
        handler: './cli/commands/search.js#default',
        flags: defineCommandFlags(searchFlags),
        examples: [
          'kb mind search --text "how does login work"',
          'kb mind search --text "ClassName" --index code --agent',
        ],
      },
      {
        path: 'mind query',
        category: 'Query',
        operationType: 'read' as const,
        describe: 'Ask a question and get an agent answer (agent-response-v1).',
        handler: './cli/commands/query.js#default',
        flags: defineCommandFlags(queryFlags),
        examples: [
          'kb mind query --text "how does auth work" --index code',
          'kb mind query --text "billing flow" --mode thinking',
        ],
      },
      {
        path: 'mind reindex',
        category: 'Index',
        operationType: 'mutate' as const,
        describe: 'Rebuild an index from source files.',
        handler: './cli/commands/reindex.js#default',
        flags: defineCommandFlags(reindexFlags),
        examples: ['kb mind reindex --index code --full'],
      },
      {
        path: 'mind sync add',
        category: 'Sync',
        operationType: 'mutate' as const,
        describe: 'Add documents to an index (incremental).',
        handler: './cli/commands/sync-add.js#default',
        flags: defineCommandFlags(syncPathsFlags),
        examples: ['kb mind sync add src/new.ts --index code'],
      },
      {
        path: 'mind sync update',
        category: 'Sync',
        operationType: 'mutate' as const,
        describe: 'Re-index updated documents (incremental).',
        handler: './cli/commands/sync-update.js#default',
        flags: defineCommandFlags(syncPathsFlags),
        examples: ['kb mind sync update src/auth.ts --index code'],
      },
      {
        path: 'mind sync delete',
        category: 'Sync',
        operationType: 'mutate' as const,
        describe: 'Remove documents from an index (incremental).',
        handler: './cli/commands/sync-delete.js#default',
        flags: defineCommandFlags(syncPathsFlags),
        examples: ['kb mind sync delete src/old.ts --index code'],
      },
      {
        path: 'mind sync list',
        category: 'Sync',
        operationType: 'read' as const,
        describe: 'List documents synced into an index.',
        handler: './cli/commands/sync-list.js#default',
        flags: defineCommandFlags(syncListFlags),
        examples: ['kb mind sync list --index code'],
      },
      {
        // Leaf must be unique across the group tree: `mind status` already
        // uses leaf `status`, so the sync variant uses `health`.
        path: 'mind sync health',
        category: 'Sync',
        operationType: 'read' as const,
        describe: 'Show sync health for an index.',
        handler: './cli/commands/sync-status.js#default',
        flags: defineCommandFlags(syncListFlags),
        examples: ['kb mind sync health --index code'],
      },
      {
        path: 'mind status',
        category: 'Index',
        operationType: 'read' as const,
        describe: 'Show Mind index status.',
        handler: './cli/commands/status.js#default',
        flags: defineCommandFlags(statusFlags),
        examples: ['kb mind status', 'kb mind status --index code'],
      },
    ],
  },

  rest: {
    basePath: MIND_BASE_PATH,
    routes: [
      {
        method: 'POST',
        path: MIND_ROUTES.INDEX,
        handler: './rest/handlers/index.js#default',
        input: { zod: '@kb-labs/mind-contracts#IndexRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#IndexResponseSchema' },
        timeoutMs: 600000,
      },
      {
        method: 'POST',
        path: MIND_ROUTES.SEARCH,
        handler: './rest/handlers/search.js#default',
        input: { zod: '@kb-labs/mind-contracts#SearchRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#SearchResponseSchema' },
      },
      {
        method: 'POST',
        path: MIND_ROUTES.QUERY,
        handler: './rest/handlers/query.js#default',
        input: { zod: '@kb-labs/mind-contracts#QueryRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#AgentResponseSchema' },
        timeoutMs: 120000,
      },
      {
        method: 'GET',
        path: MIND_ROUTES.STATUS,
        handler: './rest/handlers/status.js#default',
        output: { zod: '@kb-labs/mind-contracts#StatusResponseSchema' },
      },
      {
        method: 'GET',
        path: MIND_ROUTES.HEALTH,
        handler: './rest/handlers/health.js#default',
        output: { zod: '@kb-labs/mind-contracts#HealthResponseSchema' },
      },
      {
        method: 'POST',
        path: MIND_ROUTES.REINDEX,
        handler: './rest/handlers/reindex.js#default',
        input: { zod: '@kb-labs/mind-contracts#ReindexRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#IndexResponseSchema' },
        timeoutMs: 600000,
      },
      {
        method: 'POST',
        path: MIND_ROUTES.SYNC_ADD,
        handler: './rest/handlers/sync-add.js#default',
        input: { zod: '@kb-labs/mind-contracts#SyncAddRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#SyncResponseSchema' },
      },
      {
        method: 'POST',
        path: MIND_ROUTES.SYNC_UPDATE,
        handler: './rest/handlers/sync-update.js#default',
        input: { zod: '@kb-labs/mind-contracts#SyncUpdateRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#SyncResponseSchema' },
      },
      {
        method: 'POST',
        path: MIND_ROUTES.SYNC_DELETE,
        handler: './rest/handlers/sync-delete.js#default',
        input: { zod: '@kb-labs/mind-contracts#SyncDeleteRequestSchema' },
        output: { zod: '@kb-labs/mind-contracts#SyncResponseSchema' },
      },
      {
        method: 'GET',
        path: MIND_ROUTES.SYNC_LIST,
        handler: './rest/handlers/sync-list.js#default',
        output: { zod: '@kb-labs/mind-contracts#SyncListResponseSchema' },
      },
      {
        method: 'GET',
        path: MIND_ROUTES.SYNC_STATUS,
        handler: './rest/handlers/sync-status.js#default',
        output: { zod: '@kb-labs/mind-contracts#SyncStatusResponseSchema' },
      },
    ],
  },
};

export default manifest;
