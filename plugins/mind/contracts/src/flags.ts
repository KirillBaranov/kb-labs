/**
 * Declarative CLI flag definitions for Mind commands (`defineFlags` from
 * `@kb-labs/sdk`). Shared between the manifest and command handlers.
 */

import { defineFlags } from '@kb-labs/sdk';

const JSON_DESC = 'Output JSON';
const INDEX_DESC = 'Index/corpus id';

export const indexFlags = defineFlags({
  index: { type: 'string', description: INDEX_DESC, examples: ['code', 'docs'] },
  scope: { type: 'string', description: 'Glob/path scope to index', examples: ['src/**', 'docs/**'] },
  full: { type: 'boolean', description: 'Full rebuild instead of incremental delta', default: false },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export const searchFlags = defineFlags({
  text: { type: 'string', description: 'Query text', required: true },
  index: { type: 'string', description: `${INDEX_DESC} to search` },
  mode: { type: 'string', description: 'Query mode', examples: ['instant', 'auto', 'thinking'] },
  intent: { type: 'string', description: 'Query intent hint', examples: ['lookup', 'concept', 'architecture'] },
  limit: { type: 'number', description: 'Max results' },
  agent: { type: 'boolean', description: 'Emit machine-readable agent JSON (agent-response-v1)', default: false },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export const queryFlags = defineFlags({
  text: { type: 'string', description: 'Question to answer', required: true },
  index: { type: 'string', description: `${INDEX_DESC} to query` },
  mode: { type: 'string', description: 'Query mode', examples: ['instant', 'auto', 'thinking'] },
});

export const syncPathsFlags = defineFlags({
  index: { type: 'string', description: INDEX_DESC },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export const syncListFlags = defineFlags({
  index: { type: 'string', description: INDEX_DESC },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export const reindexFlags = defineFlags({
  index: { type: 'string', description: INDEX_DESC },
  full: { type: 'boolean', description: 'Full rebuild', default: false },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export const statusFlags = defineFlags({
  index: { type: 'string', description: 'Limit to a single index' },
  json: { type: 'boolean', description: JSON_DESC, default: false },
});

export type IndexFlags = typeof indexFlags.infer;
export type SearchFlags = typeof searchFlags.infer;
export type QueryFlags = typeof queryFlags.infer;
export type SyncPathsFlags = typeof syncPathsFlags.infer;
export type SyncListFlags = typeof syncListFlags.infer;
export type ReindexFlags = typeof reindexFlags.infer;
export type StatusFlags = typeof statusFlags.infer;
