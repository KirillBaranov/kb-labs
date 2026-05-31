/**
 * Internal engine types (not wire contracts).
 *
 * A `Chunk` is the unit of indexing/retrieval. Chunks are stored two ways:
 * - in the vector store (one `VectorRecord` per chunk, scoped by namespace=indexId)
 *   for semantic search;
 * - in a per-index `chunks.json` via `IStorage` as the corpus for BM25 and
 *   listing/status.
 */

import type { AgentSourceKind } from '@kb-labs/mind-contracts';

export interface Chunk {
  /** Stable id: `${path}#${startLine}-${endLine}`. */
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  kind: AgentSourceKind;
}

/** Metadata stored alongside each vector record. */
export interface ChunkMeta extends Record<string, unknown> {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  kind: AgentSourceKind;
}

/** Persisted per-index corpus (source of truth for BM25 + listing). */
export interface IndexManifest {
  indexId: string;
  /** Chunks keyed by id. */
  chunks: Chunk[];
  /** Per-path bookkeeping for incremental sync. */
  files: Record<string, { chunks: number; indexedAt: string }>;
  updatedAt: string | null;
}

export function chunkId(path: string, startLine: number, endLine: number): string {
  return `${path}#${startLine}-${endLine}`;
}

/** Derive a source kind from a file path. */
export function kindFromPath(path: string): AgentSourceKind {
  const lower = path.toLowerCase();
  if (lower.includes('/adr/') || /adr-\d+/.test(lower)) {
    return 'adr';
  }
  if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.txt')) {
    return 'doc';
  }
  if (
    lower.endsWith('.json') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    lower.endsWith('.toml')
  ) {
    return 'config';
  }
  return 'code';
}
