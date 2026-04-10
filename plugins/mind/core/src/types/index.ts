/**
 * Core types for KB Labs Mind
 */

export type SchemaVersion = "1.0";

export interface MindIndex {
  schemaVersion: SchemaVersion;
  generator: string;              // "kb-labs-mind@0.1.0"
  updatedAt: string;              // ISO
  root: string;                   // POSIX workspace root
  filesIndexed: number;
  apiIndexHash: string;
  depsHash: string;
  recentDiffHash: string;
  products?: Record<string, ProductSummary>;
}

export interface ProductSummary {
  name: string;                   // e.g., 'devlink' | 'aiReview' | ...
  modules: number;
  exportsCount: number;
  lastActivityAt?: string;        // ISO
}

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

export interface DepsGraph {
  schemaVersion: SchemaVersion;
  generator: string;
  root: string;                   // POSIX workspace root
  packages: Record<string, PackageNode>;  // Optional package-level info
  edges: Array<{ from: string; to: string; type: "runtime" | "dev" | "peer" | "type" }>;  // File-based edges (POSIX paths relative to workspace root)
}

export interface PackageNode {
  name: string;
  version?: string;
  private?: boolean;
  dir?: string;                   // posix
  deps?: string[];
}

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
