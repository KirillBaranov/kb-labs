/**
 * Shared types and contracts for KB Labs Mind
 * Used by ≥2 packages to avoid circular dependencies
 */

// Query modes and JSON output
export * from './query-modes';
export * from './json-output';

// Schema version
export type SchemaVersion = "1.0";

// Canonical Mind runtime/query types (public API)
export type MindIntent = 'summary' | 'search' | 'similar' | 'nav';

export interface MindSpan {
  startLine: number;
  endLine: number;
}

export interface MindChunk {
  id: string;
  chunkId?: string;
  sourceId?: string;
  path: string;
  span: MindSpan;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MindSource {
  id: string;
  paths: string[];
  exclude?: string[];
}

export interface MindScope {
  id: string;
  sourceIds?: string[];
  defaultEngine?: string;
  [key: string]: unknown;
}

export interface MindQuery {
  text: string;
  intent?: MindIntent;
  limit?: number;
  profileId?: string;
  metadata?: Record<string, unknown>;
}

export interface MindQueryResult {
  query: {
    text: string;
    intent: MindIntent;
  };
  chunks: MindChunk[];
  contextText: string;
  metadata?: Record<string, unknown>;
}

export interface MindExecutionContext {
  scope: MindScope;
  sources: MindSource[];
  workspaceRoot: string;
  limit?: number;
  profile?: { id: string };
  filters?: {
    sourceIds?: string[];
    paths?: string[];
  };
}

export interface MindIndexStats {
  filesDiscovered: number;
  filesProcessed: number;
  filesSkipped: number;
  chunksStored: number;
  chunksUpdated: number;
  chunksSkipped: number;
  errorCount: number;
  durationMs: number;
  deletedFiles?: number;
  deletedChunks?: number;
  invalidChunks?: number;
}

// Core index types
export interface MindIndex {
  schemaVersion: SchemaVersion;
  generator: string;              // "kb-labs-mind@0.1.0"
  updatedAt: string;              // ISO
  root: string;                   // POSIX workspace root
  filesIndexed: number;
  apiIndexHash: string;
  depsHash: string;
  recentDiffHash: string;
  indexChecksum: string;          // NEW: sha256 of all index files combined
  products?: Record<string, ProductSummary>;
}

export interface ProductSummary {
  name: string;                   // e.g., 'devlink' | 'aiReview' | ...
  modules: number;
  exportsCount: number;
  lastActivityAt?: string;        // ISO
}

// API index types
export interface ApiIndex {
  schemaVersion: SchemaVersion;
  generator: string;
  files: Record<string, ApiFile>; // posix paths from repo root
}

export interface ApiFile {
  exports: ApiExport[];
  comments?: string[];            // short docstrings
  size: number;                   // bytes
  sha256: string;
}

export interface ApiExport {
  name: string;
  kind: "function" | "class" | "type" | "const" | "enum" | "interface";
  signature?: string;             // compact one-line signature
  jsdoc?: string;                 // 1–2 line summary
}

// Dependency graph types
export interface DepsGraph {
  schemaVersion: SchemaVersion;
  generator: string;
  root: string;                   // POSIX workspace root path
  packages: Record<string, PackageNode>;  // Optional package-level metadata
  edges: Array<{ 
    from: string;                 // POSIX file path relative to workspace root
    to: string;                   // POSIX file path relative to workspace root  
    type: "runtime" | "dev" | "peer" | "type";
    imports?: string[];           // NEW: imported symbol names
    priority?: 'critical' | 'important' | 'normal' | 'noise';
    weight?: number;
  }>;  // File-based dependency edges (not package-based)
  summary?: {
    totalEdges: number;
    internalEdges: number;
    externalDeps: string[];
    hotspots: Array<{ file: string; inbound: number; outbound: number }>;
    maxDepth: number;
    packageGraph: Record<string, string[]>;
  };
}

export interface PackageNode {
  name: string;
  version?: string;
  private?: boolean;
  dir?: string;                   // posix
  deps?: string[];
}

// Recent diff types
export interface RecentDiff {
  schemaVersion: SchemaVersion;
  generator: string;
  since: string;                  // rev/ISO
  files: Array<{
    path: string;                 // posix
    status: "A"|"M"|"D"|"R";
    hunks?: string[];             // trimmed
    size?: number;
  }>;
}

// Context pack types
export type ContextSection =
  | "intent_summary"
  | "product_overview"
  | "project_meta"
  | "api_signatures"
  | "recent_diffs"
  | "docs_overview"
  | "impl_snippets"
  | "configs_profiles";

export interface ContextBudget {
  totalTokens: number;             // e.g. 9000
  caps: Partial<Record<ContextSection, number>>;
  truncation: "start"|"middle"|"end";
}

export type ContextSlice = "overview"|"api"|"diffs"|"snippets"|"configs"|"meta"|"docs";

export interface ContextPreset {
  name: string;
  weight: Partial<Record<ContextSlice, number>>;
}

export interface ContextPackJson {
  schemaVersion: SchemaVersion;
  generator: string;
  intent: string;
  product?: string;
  budgetApplied: ContextBudget;
  sections: Record<ContextSection, string>;  // text per section
  tokensEstimate: number;
  sectionUsage: Record<ContextSection, number>; // per-section token usage
  seed?: number;                    // random seed used for deterministic output
  deterministic: boolean;           // whether output is deterministic
}

// Pack API types
export interface PackOptions {
  cwd: string;
  intent: string;
  product?: string;                 // 'devlink' | 'aiReview' | ...
  preset?: ContextPreset;           // weights
  budget: ContextBudget;            // caps + truncation
  withBundle?: boolean;             // if true, try spawn "kb bundle print --product <id> --json"
  seed?: number;                    // random seed for deterministic output
  log?: (e: object) => void;
}

export interface PackResult {
  json: ContextPackJson;
  markdown: string;
  tokensEstimate: number;
}

export interface PackContext {
  cwd: string;
  product?: string;
  intent: string;
  budget: ContextBudget;
  preset?: ContextPreset;
  withBundle?: boolean;
  seed?: number;                    // random seed for deterministic output
  log: (e: object) => void;
}

// Token estimation interface
export interface ITokenEstimator {
  estimate(text: string): number;
  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string;
}

// Error codes for unified error handling
export type MindErrorCode = 
  | "MIND_NO_GIT"
  | "MIND_FS_TIMEOUT"
  | "MIND_PARSE_ERROR"
  | "MIND_PACK_BUDGET_EXCEEDED"
  | "MIND_FORBIDDEN"
  | "MIND_TIME_BUDGET"
  | "MIND_BAD_FLAGS"
  | "MIND_INVALID_FLAG"
  | "MIND_BUNDLE_TIMEOUT"
  | "MIND_FEED_ERROR"
  | "MIND_INIT_ERROR"
  | "MIND_UPDATE_ERROR"
  | "MIND_PACK_ERROR"
  | "MIND_GIT_ERROR"
  | "MIND_QUERY_ERROR"
  | "MIND_CACHE_ERROR"
  | "MIND_QUERY_NOT_FOUND";

// Query system types
export type QueryName = "impact" | "scope" | "exports" | "externals" | "chain" | "meta" | "docs";

export interface PathRegistry {
  [id: string]: string;
}

export interface QueryMeta {
  cwd: string;
  queryId: string;
  tokensEstimate: number;
  cached: boolean;
  truncated?: boolean;
  filesScanned: number;
  edgesTouched: number;
  depsHash: string;
  apiHash: string;
  timingMs: { load: number; filter: number; total: number };
}

export interface QueryResult<T = unknown> {
  ok: boolean;
  code: string | null;
  query: QueryName;
  params: Record<string, any>;
  result: T;
  summary?: string;  // NEW: AI-friendly summary
  suggestNextQueries?: string[];  // NEW: query suggestions
  schemaVersion: SchemaVersion;  // NEW: API schema version
  meta: QueryMeta;
  paths?: PathRegistry;
}

// Query result types
export interface ImpactResult {
  importers: Array<{ 
    file: string; 
    imports: string[];
    relevance?: number;
    context?: string;
  }>;
  count: number;
}

export interface ScopeResult {
  edges: Array<{ from: string; to: string; type: string; imports?: string[] }>;
  count: number;
}

export interface ExportsResult {
  exports: ApiExport[];
  count: number;
}

export interface ExternalsResult {
  externals: Record<string, string[]>;
  count: number;
}

export interface ChainResult {
  levels: Array<{ depth: number; files: string[] }>;
  visited: number;
}

export interface MetaResult {
  project: string;
  products: ProductMeta[];
  generatedAt: string;
}

export interface DocsResult {
  docs: DocEntry[];
  count: number;
}

export interface QueryCacheEntry {
  queryId: string;
  depsHash: string;
  apiHash: string;
  result: QueryResult;
  createdAt: string;
}

// Meta layer types
export interface ProductMeta {
  id: string;
  name: string;
  description: string;
  maintainers: string[];
  tags?: string[];
  repo?: string;
  docs?: string[];
  dependencies?: string[];
}

export interface ProjectMeta {
  schemaVersion: SchemaVersion;
  generator: string;
  project: string;
  products: ProductMeta[];
  generatedAt: string;
}

// Documentation types
export interface DocEntry {
  title: string;
  path: string;
  tags: string[];
  summary: string;
  type: "adr" | "readme" | "guide" | "api";
}

export interface DocsIndex {
  schemaVersion: SchemaVersion;
  generator: string;
  docs: DocEntry[];
  count: number;
  generatedAt: string;
}

// AI Integration types
export interface QueryManifest {
  name: string;
  description: string;
  version: string;
  queries: Array<{
    name: QueryName;
    description: string;
    parameters: Record<string, { type: string; required?: boolean; description?: string }>;
    examples: Array<{ params: Record<string, any>; description: string }>;
  }>;
}
