/**
 * @module @kb-labs/mind-engine/sync/partial-update
 * Partial update logic for updating only changed chunks
 */

import type { DocumentSyncAPI } from './document-sync';
import type {
  UpdateDocumentOptions,
  DocumentRecord,
  ChunkRecord,
} from './types';
import type { StoredMindChunk } from '../vector-store/vector-store';
import type { DocumentRegistry } from './registry/document-registry';
import { createHash } from 'node:crypto';

/**
 * Perform partial update: only update changed chunks
 */
export async function partialUpdate(
  api: DocumentSyncAPI,
  registry: DocumentRegistry,
  options: UpdateDocumentOptions,
  existing: DocumentRecord,
  newHash: string,
  similarityThreshold: number,
): Promise<import('./types').SyncResult> {
  const documentId = `${options.source}:${options.id}`;
  const startTime = Date.now();

  try {
    // Chunk new content
    const newChunks = await api.chunkContentPublic(
      options.content,
      `${options.source}/${options.id}`,
      existing.metadata.contentType,
    );

    // Get existing chunks from vector store
    const allChunks = await api.getVectorStore().getAllChunks?.(options.scopeId, {
      sourceIds: new Set([`${options.source}:${options.id}`]),
    });

    const existingChunks =
      allChunks?.filter(
        (c) => c.sourceId === `${options.source}:${options.id}`,
      ) ?? [];

    // Map existing chunks by position (span)
    const existingByPosition = new Map<string, StoredMindChunk>();
    for (const chunk of existingChunks) {
      const key = `${chunk.span.startLine}-${chunk.span.endLine}`;
      existingByPosition.set(key, chunk);
    }

    // Compare chunks and determine what to update
    const chunksToAdd: typeof newChunks = [];
    const chunksToUpdate: Array<{
      old: StoredMindChunk;
      new: (typeof newChunks)[0];
    }> = [];
    const chunksToDelete: StoredMindChunk[] = [];

    // Check new chunks against existing
    for (const newChunk of newChunks) {
      const key = `${newChunk.span.startLine}-${newChunk.span.endLine}`;
      const existingChunk = existingByPosition.get(key);

      if (!existingChunk) {
        // New chunk
        chunksToAdd.push(newChunk);
      } else {
        // Check if content changed
        const newHash = computeHash(newChunk.text);
        const oldHash = computeHash(existingChunk.text);

        if (newHash !== oldHash) {
          // Content changed
          chunksToUpdate.push({ old: existingChunk, new: newChunk });
        }
        // If hash matches, chunk is unchanged - skip
      }
    }

    // Find chunks to delete (exist in old but not in new)
    for (const existingChunk of existingChunks) {
      const key = `${existingChunk.span.startLine}-${existingChunk.span.endLine}`;
      const foundInNew = newChunks.some(
        (c) => `${c.span.startLine}-${c.span.endLine}` === key,
      );

      if (!foundInNew) {
        chunksToDelete.push(existingChunk);
      }
    }

    // If too many changes, fallback to full update
    const totalChanges = chunksToAdd.length + chunksToUpdate.length + chunksToDelete.length;
    const changeRatio = totalChanges / Math.max(existingChunks.length, newChunks.length);

    if (changeRatio > 1 - similarityThreshold) {
      // Too many changes, use full update
      api.getRuntime().log?.('debug', 'Too many changes, using full update', {
        documentId,
        changeRatio,
        threshold: 1 - similarityThreshold,
      });
      // Fallback handled by caller
      throw new Error('Too many changes for partial update');
    }

    // Create embeddings for new/updated chunks
    const chunksToEmbed = [...chunksToAdd, ...chunksToUpdate.map((c) => c.new)];
    const embeddings = await api.getEmbeddingProvider().embed(
      chunksToEmbed.map((c) => c.text),
    );

    // Build updated chunks array
    const updatedChunks: StoredMindChunk[] = [];
    let embedIdx = 0;

    // Keep unchanged chunks
    for (const existingChunk of existingChunks) {
      const key = `${existingChunk.span.startLine}-${existingChunk.span.endLine}`;
      const isDeleted = chunksToDelete.some((d) => d.chunkId === existingChunk.chunkId);
      const isUpdated = chunksToUpdate.some((u) => u.old.chunkId === existingChunk.chunkId);

      if (!isDeleted && !isUpdated) {
        // Keep unchanged chunk
        updatedChunks.push(existingChunk);
      }
    }

    // Add updated chunks
    for (const { old, new: newChunk } of chunksToUpdate) {
      const chunkId = old.chunkId; // Keep same chunkId
      updatedChunks.push({
        ...old,
        text: newChunk.text,
        span: newChunk.span,
        embedding: embeddings[embedIdx]!,
        metadata: {
          ...old.metadata,
          syncHash: computeHash(newChunk.text),
        },
      });
      embedIdx++;
    }

    // Add new chunks
    for (const newChunk of chunksToAdd) {
      const chunkId = `${options.source}:${options.id}:${newChunk.span.startLine}-${newChunk.span.endLine}:${Date.now()}`;
      updatedChunks.push({
        chunkId,
        scopeId: options.scopeId,
        sourceId: `${options.source}:${options.id}`,
        path: `external://${options.source}/${options.id}`,
        span: newChunk.span,
        text: newChunk.text,
        metadata: {
          ...existing.metadata,
          ...options.metadata,
          source: options.source,
          externalId: options.id,
          syncHash: computeHash(newChunk.text),
        },
        embedding: embeddings[embedIdx]!,
      });
      embedIdx++;
    }

    // Get all chunks for scope (excluding this document)
    const otherChunks =
      (await api.getVectorStore().getAllChunks?.(options.scopeId)) ?? [];
    const otherChunksFiltered = otherChunks.filter(
      (c) => c.sourceId !== `${options.source}:${options.id}`,
    );

    // Replace scope with merged chunks
    await api.getVectorStore().replaceScope(options.scopeId, [
      ...otherChunksFiltered,
      ...updatedChunks,
    ]);

    // Update registry
    const chunkRecords: ChunkRecord[] = updatedChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      contentHash: computeHash(chunk.text),
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

    await registry.save(updatedRecord);

    const duration = Date.now() - startTime;
    api.getRuntime().log?.('info', 'Document partially updated', {
      documentId,
      scopeId: options.scopeId,
      chunksAdded: chunksToAdd.length,
      chunksUpdated: chunksToUpdate.length,
      chunksDeleted: chunksToDelete.length,
      duration,
    });

    return {
      success: true,
      documentId,
      scopeId: options.scopeId,
      chunksAdded: chunksToAdd.length,
      chunksUpdated: chunksToUpdate.length,
      chunksDeleted: chunksToDelete.length,
    };
  } catch (error) {
    // If partial update fails, throw to trigger full update
    throw error;
  }
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

