/**
 * @module @kb-labs/mind-engine/index/manifest
 * Index manifest types and utilities for incremental indexing
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Index manifest containing metadata about the index
 */
export interface IndexManifest {
  /** Manifest format version (semver) */
  version: string;

  /** ISO timestamp when index was created */
  createdAt: string;

  /** Revision ID for this index build */
  indexRevision: string;

  /** ISO timestamp when index build finished */
  builtAt: string;

  /** Git commit hash at index time */
  gitRevision: string;

  /** Branch name (main, develop, etc.) */
  branch: string;

  /** Scope ID for this index */
  scopeId: string;

  /** Workspace root used for index build */
  workspaceRoot: string;

  /** Hash of engine config used for this build */
  engineConfigHash: string;

  /** Hash of sources topology used for this build */
  sourcesDigest: string;

  /** Index statistics */
  stats: IndexStats;

  /** Storage information */
  storage: IndexStorage;

  /** Files included in this index */
  files?: IndexedFile[];
}

/**
 * Statistics about the index
 */
export interface IndexStats {
  /** Total number of chunks */
  totalChunks: number;

  /** Total number of files indexed */
  totalFiles: number;

  /** Estimated total tokens */
  totalTokens: number;

  /** Embedding model used */
  embeddingModel: string;

  /** Embedding dimension */
  embeddingDimension: number;

  /** Index creation time in milliseconds */
  indexTimeMs: number;
}

/**
 * Storage location and verification info
 */
export interface IndexStorage {
  /** Storage type */
  type: 'local' | 's3' | 'gcs' | 'azure';

  /** Path or URL to index */
  location: string;

  /** SHA256 checksum of index archive */
  checksum: string;

  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Information about an indexed file
 */
export interface IndexedFile {
  /** Relative file path */
  path: string;

  /** File content hash */
  hash: string;

  /** Last modified timestamp */
  mtime: number;

  /** Number of chunks from this file */
  chunkCount: number;
}

/**
 * Current manifest format version
 */
export const MANIFEST_VERSION = '2.0.0';

/**
 * Default manifest filename
 */
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Create a new index manifest
 */
export function createManifest(options: {
  scopeId: string;
  gitRevision: string;
  branch: string;
  indexRevision: string;
  builtAt?: string;
  workspaceRoot: string;
  engineConfigHash: string;
  sourcesDigest: string;
  stats: IndexStats;
  storage: IndexStorage;
  files?: IndexedFile[];
}): IndexManifest {
  return {
    version: MANIFEST_VERSION,
    createdAt: new Date().toISOString(),
    indexRevision: options.indexRevision,
    builtAt: options.builtAt ?? new Date().toISOString(),
    gitRevision: options.gitRevision,
    branch: options.branch,
    scopeId: options.scopeId,
    workspaceRoot: options.workspaceRoot,
    engineConfigHash: options.engineConfigHash,
    sourcesDigest: options.sourcesDigest,
    stats: options.stats,
    storage: options.storage,
    files: options.files,
  };
}

/**
 * Validate manifest version compatibility
 */
export function isCompatibleManifest(manifest: IndexManifest): boolean {
  const [major] = manifest.version.split('.');
  const [currentMajor] = MANIFEST_VERSION.split('.');
  return major === currentMajor;
}

/**
 * Load manifest from file
 */
export async function loadManifest(manifestPath: string): Promise<IndexManifest> {
  const content = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(content) as IndexManifest;

  if (!isCompatibleManifest(manifest)) {
    throw new Error(
      `Incompatible manifest version: ${manifest.version}. Expected: ${MANIFEST_VERSION}`
    );
  }

  const hasRequiredFields =
    typeof manifest.indexRevision === 'string' &&
    manifest.indexRevision.length > 0 &&
    typeof manifest.builtAt === 'string' &&
    manifest.builtAt.length > 0 &&
    typeof manifest.workspaceRoot === 'string' &&
    manifest.workspaceRoot.length > 0 &&
    typeof manifest.engineConfigHash === 'string' &&
    manifest.engineConfigHash.length > 0 &&
    typeof manifest.sourcesDigest === 'string' &&
    manifest.sourcesDigest.length > 0;

  if (!hasRequiredFields) {
    throw new Error(
      'Incompatible manifest schema: missing required v2 fields (indexRevision, builtAt, workspaceRoot, engineConfigHash, sourcesDigest)'
    );
  }

  return manifest;
}

/**
 * Save manifest to file
 */
export async function saveManifest(
  manifest: IndexManifest,
  manifestPath: string
): Promise<void> {
  const dir = path.dirname(manifestPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Calculate checksum for index data
 */
export function calculateChecksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Get default index directory path
 */
export function getDefaultIndexDir(workspaceRoot: string, scopeId: string): string {
  return path.join(workspaceRoot, '.kb', 'mind', 'indexes', scopeId);
}

/**
 * Get manifest path for an index directory
 */
export function getManifestPath(indexDir: string): string {
  return path.join(indexDir, MANIFEST_FILENAME);
}
