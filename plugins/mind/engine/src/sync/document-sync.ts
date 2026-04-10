/**
 * @module @kb-labs/mind-engine/sync/document-sync
 * Core API for document synchronization
 */

import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from '../types/embedding-provider';
import type { VectorStore, StoredMindChunk } from '../vector-store/vector-store';
import { getChunkerForFile } from '../chunking/index';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';
import type {
  AddDocumentOptions,
  UpdateDocumentOptions,
  DeleteDocumentOptions,
  ListDocumentsOptions,
  SyncResult,
  DocumentRecord,
  ChunkRecord,
  DocumentMetadata,
} from './types';
import type { DocumentRegistry } from './registry/document-registry';
import { partialUpdate } from './partial-update';

export interface DocumentSyncAPIOptions {
  registry: DocumentRegistry;
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  runtime: RuntimeAdapter;
  config?: {
    softDelete?: {
      enabled?: boolean;
      ttlDays?: number;
    };
    partialUpdates?: {
      enabled?: boolean;
      similarityThreshold?: number;
    };
  };
}

/**
 * Core API for document synchronization
 */
export class DocumentSyncAPI {
  private readonly registry: DocumentRegistry;
  private readonly vectorStore: VectorStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly runtime: RuntimeAdapter;
  private readonly softDeleteEnabled: boolean;
  private readonly softDeleteTTLDays: number;
  private readonly partialUpdatesEnabled: boolean;
  private readonly similarityThreshold: number;

  constructor(options: DocumentSyncAPIOptions) {
    this.registry = options.registry;
    this.vectorStore = options.vectorStore;
    this.embeddingProvider = options.embeddingProvider;
    this.runtime = options.runtime;
    this.softDeleteEnabled = options.config?.softDelete?.enabled ?? true;
    this.softDeleteTTLDays = options.config?.softDelete?.ttlDays ?? 30;
    this.partialUpdatesEnabled = options.config?.partialUpdates?.enabled ?? true;
    this.similarityThreshold = options.config?.partialUpdates?.similarityThreshold ?? 0.8;
  }

  /**
   * Add a document
   */
  async addDocument(options: AddDocumentOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const documentId = `${options.source}:${options.id}`;

    try {
      // Check if document already exists
      const existing = await this.registry.get(
        options.source,
        options.id,
        options.scopeId,
      );

      if (existing) {
        if (existing.deleted) {
          // Restore deleted document
          return this.updateDocument({
            source: options.source,
            id: options.id,
            scopeId: options.scopeId,
            content: options.content,
            metadata: options.metadata,
          });
        }
        // Document exists and not deleted, treat as update
        return this.updateDocument({
          source: options.source,
          id: options.id,
          scopeId: options.scopeId,
          content: options.content,
          metadata: options.metadata,
        });
      }

      // Compute content hash
      const contentHash = this.computeHash(options.content);

      // Chunk the content
      const chunks = await this.chunkContent(
        options.content,
        `${options.source}/${options.id}`,
        options.metadata?.contentType,
      );

      // Create embeddings
      const embeddings = await this.embeddingProvider.embed(
        chunks.map((c) => c.text),
      );

      // Create stored chunks
      const storedChunks: StoredMindChunk[] = chunks.map((chunk, idx) => ({
        chunkId: `${options.source}:${options.id}:${chunk.span.startLine}-${chunk.span.endLine}:${idx}`,
        scopeId: options.scopeId,
        sourceId: `${options.source}:${options.id}`,
        path: `external://${options.source}/${options.id}`,
        span: chunk.span,
        text: chunk.text,
        metadata: {
          ...options.metadata,
          source: options.source,
          externalId: options.id,
          syncHash: this.computeHash(chunk.text),
        },
        embedding: embeddings[idx]!,
      }));

      // Save chunks to vector store
      await this.vectorStore.replaceScope(options.scopeId, storedChunks);

      // Create chunk records
      const chunkRecords: ChunkRecord[] = chunks.map((chunk, idx) => ({
        chunkId: storedChunks[idx]!.chunkId,
        contentHash: this.computeHash(chunk.text),
        text: chunk.text,
        span: chunk.span,
      }));

      // Save to registry
      const record: DocumentRecord = {
        source: options.source,
        id: options.id,
        scopeId: options.scopeId,
        contentHash,
        chunks: chunkRecords,
        metadata: options.metadata ?? {},
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
      };

      await this.registry.save(record);

      const duration = Date.now() - startTime;
      this.runtime.log?.('info', 'Document added', {
        documentId,
        scopeId: options.scopeId,
        chunksCount: storedChunks.length,
        duration,
      });

      return {
        success: true,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: storedChunks.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.runtime.log?.('error', 'Failed to add document', {
        documentId,
        scopeId: options.scopeId,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Update a document
   */
  async updateDocument(options: UpdateDocumentOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const documentId = `${options.source}:${options.id}`;

    try {
      // Get existing record
      const existing = await this.registry.get(
        options.source,
        options.id,
        options.scopeId,
      );

      if (!existing) {
        // Document doesn't exist, treat as add
        return this.addDocument({
          source: options.source,
          id: options.id,
          scopeId: options.scopeId,
          content: options.content,
          metadata: options.metadata as DocumentMetadata,
        });
      }

      // Compute new hash
      const newHash = this.computeHash(options.content);

      // If hash hasn't changed, skip update
      if (existing.contentHash === newHash && !options.metadata) {
        this.runtime.log?.('debug', 'Document hash unchanged, skipping update', {
          documentId,
          scopeId: options.scopeId,
        });
        return {
          success: true,
          documentId,
          scopeId: options.scopeId,
          chunksAdded: 0,
          chunksUpdated: 0,
          chunksDeleted: 0,
        };
      }

      // Use partial update if enabled and document exists
      if (
        this.partialUpdatesEnabled &&
        existing.chunks.length > 0 &&
        !existing.deleted
      ) {
        try {
          return partialUpdate(
            this,
            this.registry,
            options,
            existing,
            newHash,
            this.similarityThreshold,
          );
        } catch (error) {
          // If partial update fails, fallback to full update
          this.runtime.log?.('warn', 'Partial update failed, using full update', {
            documentId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with full update below
        }
      }

      // Full update: delete old chunks and add new ones
      const oldChunkIds = existing.chunks.map((c) => c.chunkId);

      // Get all chunks for this document from vector store
      const allChunks = await this.vectorStore.getAllChunks?.(options.scopeId, {
        sourceIds: new Set([`${options.source}:${options.id}`]),
      });

      // Delete old chunks
      if (allChunks && allChunks.length > 0) {
        // Filter out chunks that belong to this document
        const remainingChunks = allChunks.filter(
          (c) => !oldChunkIds.includes(c.chunkId),
        );
        await this.vectorStore.replaceScope(options.scopeId, remainingChunks);
      }

      // Chunk new content
      const chunks = await this.chunkContent(
        options.content,
        `${options.source}/${options.id}`,
        existing.metadata.contentType,
      );

      // Create embeddings
      const embeddings = await this.embeddingProvider.embed(
        chunks.map((c) => c.text),
      );

      // Create stored chunks
      const storedChunks: StoredMindChunk[] = chunks.map((chunk, idx) => ({
        chunkId: `${options.source}:${options.id}:${chunk.span.startLine}-${chunk.span.endLine}:${idx}`,
        scopeId: options.scopeId,
        sourceId: `${options.source}:${options.id}`,
        path: `external://${options.source}/${options.id}`,
        span: chunk.span,
        text: chunk.text,
        metadata: {
          ...existing.metadata,
          ...options.metadata,
          source: options.source,
          externalId: options.id,
          syncHash: this.computeHash(chunk.text),
        },
        embedding: embeddings[idx]!,
      }));

      // Get existing chunks for scope
      const existingScopeChunks =
        (await this.vectorStore.getAllChunks?.(options.scopeId)) ?? [];

      // Merge with new chunks
      const mergedChunks = [
        ...existingScopeChunks.filter(
          (c) => c.sourceId !== `${options.source}:${options.id}`,
        ),
        ...storedChunks,
      ];

      await this.vectorStore.replaceScope(options.scopeId, mergedChunks);

      // Update registry
      const chunkRecords: ChunkRecord[] = chunks.map((chunk, idx) => ({
        chunkId: storedChunks[idx]!.chunkId,
        contentHash: this.computeHash(chunk.text),
        text: chunk.text,
        span: chunk.span,
      }));

      const updatedRecord: DocumentRecord = {
        ...existing,
        contentHash: newHash,
        chunks: chunkRecords,
        metadata: {
          ...existing.metadata,
          ...options.metadata,
        },
        updatedAt: new Date().toISOString(),
        deleted: false,
        deletedAt: undefined,
      };

      await this.registry.save(updatedRecord);

      const duration = Date.now() - startTime;
      this.runtime.log?.('info', 'Document updated', {
        documentId,
        scopeId: options.scopeId,
        chunksAdded: storedChunks.length,
        chunksDeleted: oldChunkIds.length,
        duration,
      });

      return {
        success: true,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: storedChunks.length,
        chunksUpdated: storedChunks.length,
        chunksDeleted: oldChunkIds.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.runtime.log?.('error', 'Failed to update document', {
        documentId,
        scopeId: options.scopeId,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(options: DeleteDocumentOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const documentId = `${options.source}:${options.id}`;

    try {
      const existing = await this.registry.get(
        options.source,
        options.id,
        options.scopeId,
      );

      if (!existing) {
        return {
          success: false,
          documentId,
          scopeId: options.scopeId,
          chunksAdded: 0,
          chunksDeleted: 0,
          error: 'Document not found',
        };
      }

      // Get chunks for this document
      const allChunks = await this.vectorStore.getAllChunks?.(options.scopeId, {
        sourceIds: new Set([`${options.source}:${options.id}`]),
      });

      const chunksToDelete = allChunks?.filter(
        (c) => c.sourceId === `${options.source}:${options.id}`,
      ) ?? [];

      if (this.softDeleteEnabled) {
        // Soft delete: mark as deleted but keep record
        const updatedRecord: DocumentRecord = {
          ...existing,
          deleted: true,
          deletedAt: new Date().toISOString(),
        };
        await this.registry.save(updatedRecord);

        // Delete chunks from vector store
        if (chunksToDelete.length > 0) {
          const remainingChunks =
            (await this.vectorStore.getAllChunks?.(options.scopeId)) ?? [];
          const filteredChunks = remainingChunks.filter(
            (c) => !chunksToDelete.some((d) => d.chunkId === c.chunkId),
          );
          await this.vectorStore.replaceScope(options.scopeId, filteredChunks);
        }
      } else {
        // Hard delete: remove completely
        if (chunksToDelete.length > 0) {
          const remainingChunks =
            (await this.vectorStore.getAllChunks?.(options.scopeId)) ?? [];
          const filteredChunks = remainingChunks.filter(
            (c) => !chunksToDelete.some((d) => d.chunkId === c.chunkId),
          );
          await this.vectorStore.replaceScope(options.scopeId, filteredChunks);
        }
        await this.registry.delete(options.source, options.id, options.scopeId);
      }

      const duration = Date.now() - startTime;
      this.runtime.log?.('info', 'Document deleted', {
        documentId,
        scopeId: options.scopeId,
        chunksDeleted: chunksToDelete.length,
        softDelete: this.softDeleteEnabled,
        duration,
      });

      return {
        success: true,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        chunksDeleted: chunksToDelete.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.runtime.log?.('error', 'Failed to delete document', {
        documentId,
        scopeId: options.scopeId,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        chunksDeleted: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * List documents
   */
  async listDocuments(
    options: ListDocumentsOptions = {},
  ): Promise<DocumentRecord[]> {
    return this.registry.list(
      options.source,
      options.scopeId,
      options.includeDeleted,
    );
  }

  /**
   * Hard delete a document (bypass soft-delete)
   */
  async hardDeleteDocument(
    options: DeleteDocumentOptions,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const documentId = `${options.source}:${options.id}`;

    try {
      const existing = await this.registry.get(
        options.source,
        options.id,
        options.scopeId,
      );

      if (!existing) {
        return {
          success: false,
          documentId,
          scopeId: options.scopeId,
          chunksAdded: 0,
          chunksDeleted: 0,
          error: 'Document not found',
        };
      }

      // Get chunks for this document
      const allChunks = await this.vectorStore.getAllChunks?.(options.scopeId, {
        sourceIds: new Set([`${options.source}:${options.id}`]),
      });

      const chunksToDelete = allChunks?.filter(
        (c) => c.sourceId === `${options.source}:${options.id}`,
      ) ?? [];

      // Hard delete: remove chunks and registry entry
      if (chunksToDelete.length > 0) {
        const remainingChunks =
          (await this.vectorStore.getAllChunks?.(options.scopeId)) ?? [];
        const filteredChunks = remainingChunks.filter(
          (c) => !chunksToDelete.some((d) => d.chunkId === c.chunkId),
        );
        await this.vectorStore.replaceScope(options.scopeId, filteredChunks);
      }
      await this.registry.delete(options.source, options.id, options.scopeId);

      const duration = Date.now() - startTime;
      this.runtime.log?.('info', 'Document hard deleted', {
        documentId,
        scopeId: options.scopeId,
        chunksDeleted: chunksToDelete.length,
        duration,
      });

      return {
        success: true,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        chunksDeleted: chunksToDelete.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.runtime.log?.('error', 'Failed to hard delete document', {
        documentId,
        scopeId: options.scopeId,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        documentId,
        scopeId: options.scopeId,
        chunksAdded: 0,
        chunksDeleted: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Restore a soft-deleted document
   */
  async restoreDocument(
    options: DeleteDocumentOptions,
  ): Promise<SyncResult> {
    const existing = await this.registry.get(
      options.source,
      options.id,
      options.scopeId,
    );

    if (!existing) {
      return {
        success: false,
        documentId: `${options.source}:${options.id}`,
        scopeId: options.scopeId,
        chunksAdded: 0,
        error: 'Document not found',
      };
    }

    if (!existing.deleted) {
      return {
        success: false,
        documentId: `${options.source}:${options.id}`,
        scopeId: options.scopeId,
        chunksAdded: 0,
        error: 'Document is not deleted',
      };
    }

    // Check TTL
    if (existing.deletedAt) {
      const deletedAt = new Date(existing.deletedAt);
      const ttlMs = this.softDeleteTTLDays * 24 * 60 * 60 * 1000;
      if (Date.now() - deletedAt.getTime() > ttlMs) {
        return {
          success: false,
          documentId: `${options.source}:${options.id}`,
          scopeId: options.scopeId,
          chunksAdded: 0,
          error: 'Document TTL expired, cannot restore',
        };
      }
    }

    // Restore: remove deleted flag
    const restoredRecord: DocumentRecord = {
      ...existing,
      deleted: false,
      deletedAt: undefined,
    };
    await this.registry.save(restoredRecord);

    // Note: chunks were already deleted, so restoration requires re-indexing
    // This is expected - the plugin should re-sync the document content

    return {
      success: true,
      documentId: `${options.source}:${options.id}`,
      scopeId: options.scopeId,
      chunksAdded: 0,
    };
  }

  /**
   * Chunk content using appropriate chunker
   */
  private async chunkContent(
    content: string,
    filePath: string,
    contentType?: string,
  ): Promise<Array<{ text: string; span: { startLine: number; endLine: number } }>> {
    // CRITICAL OOM FIX: Check content size BEFORE chunking to prevent split() OOM
    const contentSizeMB = content.length / (1024 * 1024);
    const MAX_CONTENT_SIZE_MB = 10;

    if (contentSizeMB > MAX_CONTENT_SIZE_MB) {
      this.runtime.log?.('warn', `Content too large for chunking, truncating`, {
        filePath,
        sizeMB: contentSizeMB.toFixed(2),
        maxMB: MAX_CONTENT_SIZE_MB,
      });

      // Truncate content to safe size BEFORE chunking
      const maxBytes = MAX_CONTENT_SIZE_MB * 1024 * 1024;
      content = content.slice(0, maxBytes) + '\n\n[Content truncated due to size limit]';
    }

    // Determine file extension based on content type or use default
    let extension = '.txt';
    if (contentType === 'markdown' || contentType === 'md') {
      extension = '.md';
    } else if (contentType === 'html') {
      extension = '.html';
    }

    const chunker = getChunkerForFile(`${filePath}${extension}`);
    const chunks = chunker.chunk(content, filePath, {
      maxLines: 150,
      minLines: 30,
      preserveContext: true,
    });

    return chunks.map((chunk) => ({
      text: chunk.text,
      span: chunk.span,
    }));
  }

  /**
   * Compute SHA-256 hash
   */
  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  // Expose internal methods for partial update
  getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  getEmbeddingProvider(): EmbeddingProvider {
    return this.embeddingProvider;
  }

  getRuntime(): RuntimeAdapter {
    return this.runtime;
  }

  async chunkContentPublic(
    content: string,
    filePath: string,
    contentType?: string,
  ): Promise<Array<{ text: string; span: { startLine: number; endLine: number } }>> {
    return this.chunkContent(content, filePath, contentType);
  }
}

