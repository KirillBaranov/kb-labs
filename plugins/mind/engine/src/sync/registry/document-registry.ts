/**
 * @module @kb-labs/mind-engine/sync/registry/document-registry
 * Document registry interface for tracking synchronized documents
 */

import type { DocumentRecord } from '../types';

/**
 * Document registry interface
 */
export interface DocumentRegistry {
  /**
   * Save a document record
   */
  save(record: DocumentRecord): Promise<void>;

  /**
   * Get a document record
   */
  get(source: string, id: string, scopeId: string): Promise<DocumentRecord | null>;

  /**
   * Delete a document record
   */
  delete(source: string, id: string, scopeId: string): Promise<void>;

  /**
   * List document records
   */
  list(source?: string, scopeId?: string, includeDeleted?: boolean): Promise<DocumentRecord[]>;

  /**
   * Check if a document exists
   */
  exists(source: string, id: string, scopeId: string): Promise<boolean>;

  /**
   * Close registry (for cleanup, optional)
   */
  close?(): Promise<void>;
}



