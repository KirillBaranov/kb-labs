/**
 * Types for KB Labs Mind Indexer
 */

import type { ApiIndex, DepsGraph, RecentDiff } from "@kb-labs/mind-types";

export interface UpdateOptions {
  cwd: string;
  changed?: string[];              // posix relative
  since?: string;                  // git rev or ISO
  timeBudgetMs?: number;           // soft cap; default 800ms
  log?: (e: object) => void;       // structured logs
}

export interface DeltaReport {
  api: { added: number; updated: number; removed: number };
  deps?: { edgesAdded: number; edgesRemoved: number };
  diff?: { files: number };
  budget: { limitMs: number; usedMs: number };
  partial?: boolean;               // budget exceeded
  durationMs: number;
}

export interface InitOptions {
  cwd: string;
  force?: boolean;
  log?: (e: object) => void;
}

export interface CacheEntry {
  mtime: number;
  size: number;
  sha?: string;
}

export interface IndexerContext {
  cwd: string;
  root: string;
  timeBudgetMs: number;
  startTime: number;
  log: (e: object) => void;
  apiIndex: ApiIndex;
  depsGraph: DepsGraph;
  recentDiff: RecentDiff;
}

import type { ApiExport } from "@kb-labs/mind-core";

// Adapter interface for TS parsing
export interface IExportExtractor {
  extractExports(filePath: string, content: string): Promise<ApiExport[]>;
}
