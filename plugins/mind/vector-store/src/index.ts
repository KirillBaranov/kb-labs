import path from 'node:path';
import fs from 'fs-extra';
import { cosineSimilarity as calculateCosineSimilarity } from '@kb-labs/mind-core';

export interface EmbeddingVector {
  dim: number;
  values: number[];
}

export interface SpanRange {
  startLine: number;
  endLine: number;
}

export interface StoredMindChunk {
  chunkId: string;
  scopeId: string;
  sourceId: string;
  path: string;
  span: SpanRange;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: EmbeddingVector;
}

export interface FileMetadata {
  path: string;
  mtime: number;
  hash: string;
}

export interface MindVectorStoreOptions {
  indexDir: string;
}

export interface VectorSearchFilters {
  sourceIds?: Set<string>;
  pathMatcher?: (filePath: string) => boolean;
}

export interface VectorSearchMatch {
  chunk: StoredMindChunk;
  score: number;
}

interface ScopeIndexFile {
  scopeId: string;
  generatedAt: string;
  chunks: StoredMindChunk[];
}

export class MindVectorStore {
  private readonly options: MindVectorStoreOptions;
  private readonly cache = new Map<string, StoredMindChunk[]>();

  constructor(options: MindVectorStoreOptions) {
    this.options = options;
  }

  async replaceScope(
    scopeId: string,
    chunks: StoredMindChunk[],
  ): Promise<void> {
    this.cache.set(scopeId, chunks);
    await fs.ensureDir(this.options.indexDir);
    const filePath = this.getScopePath(scopeId);
    const payload: ScopeIndexFile = {
      scopeId,
      generatedAt: new Date().toISOString(),
      chunks,
    };
    await fs.writeJson(filePath, payload, { spaces: 2 });
  }

  async scopeExists(scopeId: string): Promise<boolean> {
    const filePath = this.getScopePath(scopeId);
    return fs.pathExists(filePath);
  }

  async updateScope(
    scopeId: string,
    chunks: StoredMindChunk[],
    fileMetadata?: Map<string, FileMetadata>,
  ): Promise<void> {
    if (!fileMetadata || fileMetadata.size === 0) {
      // Fallback to full rebuild if no metadata provided
      return this.replaceScope(scopeId, chunks);
    }

    // Get existing chunks for comparison
    const existingChunks = await this.loadScope(scopeId);
    const existingFiles = new Map<string, FileMetadata>();

    // Extract file metadata from existing chunks
    for (const chunk of existingChunks) {
      const existingMeta = chunk.metadata as { fileHash?: string; fileMtime?: number } | undefined;
      if (existingMeta?.fileHash && existingMeta?.fileMtime) {
        const currentMeta = existingFiles.get(chunk.path);
        // Keep the latest mtime if multiple chunks from same file
        if (!currentMeta || (existingMeta.fileMtime > (currentMeta.mtime ?? 0))) {
          existingFiles.set(chunk.path, {
            path: chunk.path,
            mtime: existingMeta.fileMtime,
            hash: existingMeta.fileHash,
          });
        }
      }
    }

    // Determine which files changed
    const changedFiles = new Set<string>();
    const deletedFiles = new Set<string>();

    // Check for changed or new files
    for (const [path, newMeta] of fileMetadata.entries()) {
      const existingMeta = existingFiles.get(path);
      if (!existingMeta || existingMeta.hash !== newMeta.hash || existingMeta.mtime !== newMeta.mtime) {
        changedFiles.add(path);
      }
    }

    // Check for deleted files
    for (const path of existingFiles.keys()) {
      if (!fileMetadata.has(path)) {
        deletedFiles.add(path);
      }
    }

    // If everything changed, use full rebuild (more efficient)
    if (changedFiles.size + deletedFiles.size >= existingFiles.size * 0.8) {
      return this.replaceScope(scopeId, chunks);
    }

    // Filter out chunks from deleted and changed files
    const unchangedChunks = existingChunks.filter(chunk =>
      !deletedFiles.has(chunk.path) && !changedFiles.has(chunk.path)
    );

    // Add new chunks only from changed files
    const newChunks = chunks.filter(chunk => changedFiles.has(chunk.path));

    // Combine unchanged and new chunks
    const updatedChunks = [...unchangedChunks, ...newChunks];

    // Save updated index
    this.cache.set(scopeId, updatedChunks);
    await fs.ensureDir(this.options.indexDir);
    const filePath = this.getScopePath(scopeId);
    const payload: ScopeIndexFile = {
      scopeId,
      generatedAt: new Date().toISOString(),
      chunks: updatedChunks,
    };
    await fs.writeJson(filePath, payload, { spaces: 2 });
  }

  async search(
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ): Promise<VectorSearchMatch[]> {
    const records = await this.loadScope(scopeId);
    if (records.length === 0) {
      return [];
    }

    return records
      .filter(chunk => applyFilters(chunk, filters))
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(vector, chunk.embedding),
      }))
      .filter(match => Number.isFinite(match.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async loadScope(scopeId: string): Promise<StoredMindChunk[]> {
    const cached = this.cache.get(scopeId);
    if (cached) {
      return cached;
    }

    const filePath = this.getScopePath(scopeId);
    if (!(await fs.pathExists(filePath))) {
      this.cache.set(scopeId, []);
      return [];
    }

    const payload = (await fs.readJson(filePath)) as ScopeIndexFile;
    this.cache.set(scopeId, payload.chunks);
    return payload.chunks;
  }

  private getScopePath(scopeId: string): string {
    const safeId = scopeId.replace(/[\\/]/g, '_');
    return path.join(this.options.indexDir, `${safeId}.json`);
  }
}

function applyFilters(
  chunk: StoredMindChunk,
  filters?: VectorSearchFilters,
): boolean {
  if (!filters) {
    return true;
  }
  if (
    filters.sourceIds?.size &&
    !filters.sourceIds.has(chunk.sourceId)
  ) {
    return false;
  }
  if (filters.pathMatcher && !filters.pathMatcher(chunk.path)) {
    return false;
  }
  return true;
}

/**
 * Wrapper for cosineSimilarity that works with EmbeddingVector types
 */
function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.dim !== b.dim) {
    return 0;
  }
  return calculateCosineSimilarity(a.values, b.values);
}
