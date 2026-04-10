/**
 * @module @kb-labs/mind-engine/sync/types
 * Types and interfaces for document synchronization
 */

import type { SpanRange } from '../types/engine-contracts';

/**
 * External document from a sync source
 */
export interface ExternalDocument {
  source: string; // 'clickup', 'git', 'confluence', etc.
  id: string; // Unique ID in the source system
  scopeId: string; // Scope for indexing
  content: string; // Document content
  metadata?: DocumentMetadata;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  title?: string;
  url?: string;
  updatedAt?: string;
  author?: string;
  version?: string;
  contentType?: string; // 'markdown', 'html', 'text', etc.
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Chunk record for tracking individual chunks
 */
export interface ChunkRecord {
  chunkId: string;
  contentHash: string; // SHA-256 hash of chunk content
  text: string; // Chunk text (for comparison)
  span: SpanRange; // Position in document
}

/**
 * Document record in registry
 */
export interface DocumentRecord {
  source: string;
  id: string;
  scopeId: string;
  contentHash: string; // SHA-256 hash of full content
  chunks: ChunkRecord[]; // Detailed chunk information
  metadata: DocumentMetadata;
  syncedAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  deletedAt?: string; // ISO timestamp if soft-deleted
  deleted: boolean; // Soft-delete flag
  ttl?: number; // TTL in days (optional)
}

/**
 * Options for adding a document
 */
export interface AddDocumentOptions {
  source: string;
  id: string;
  scopeId: string;
  content: string;
  metadata?: DocumentMetadata;
}

/**
 * Options for updating a document
 */
export interface UpdateDocumentOptions {
  source: string;
  id: string;
  scopeId: string;
  content: string;
  metadata?: Partial<DocumentMetadata>;
}

/**
 * Options for deleting a document
 */
export interface DeleteDocumentOptions {
  source: string;
  id: string;
  scopeId: string;
}

/**
 * Options for listing documents
 */
export interface ListDocumentsOptions {
  source?: string;
  scopeId?: string;
  includeDeleted?: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  documentId: string; // source:id
  scopeId: string;
  chunksAdded: number;
  chunksUpdated?: number;
  chunksDeleted?: number;
  error?: string;
}

/**
 * Sync operation for batch processing
 */
export interface SyncOperation {
  operation: 'add' | 'update' | 'delete';
  source: string;
  id: string;
  scopeId: string;
  content?: string; // Required for add/update
  metadata?: DocumentMetadata | Partial<DocumentMetadata>;
}

/**
 * Result of batch sync operation
 */
export interface BatchSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  type?: 'filesystem' | 'database';
  path?: string; // For filesystem
  backup?: boolean;
  backupRetention?: number;
  // Future: database connection config
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  registry?: RegistryConfig;
  batch?: {
    maxSize?: number;
    maxSizeOverride?: number;
    defaultConcurrency?: number;
  };
  softDelete?: {
    enabled?: boolean;
    ttlDays?: number;
    cleanupInterval?: string;
  };
  partialUpdates?: {
    enabled?: boolean;
    similarityThreshold?: number;
  };
  monitoring?: {
    enabled?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    metricsPath?: string;
  };
}

/**
 * Sync metrics
 */
export interface SyncMetrics {
  totalDocuments: number;
  totalChunks: number;
  documentsBySource: Record<string, number>;
  chunksBySource: Record<string, number>;
  documentsByScope: Record<string, number>;
  chunksByScope: Record<string, number>;
  lastSyncTime: Record<string, string>;
  averageSyncDuration: Record<string, number>;
  errorCount: number;
  errorsBySource: Record<string, number>;
  deletedDocuments: number;
  deletedBySource: Record<string, number>;
}



