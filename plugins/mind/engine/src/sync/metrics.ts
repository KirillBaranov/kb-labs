/**
 * @module @kb-labs/mind-engine/sync/metrics
 * Metrics and monitoring for synchronization
 */

import type { SyncMetrics } from './types';
import type { DocumentRegistry } from './registry/document-registry';

/**
 * Calculate sync metrics from registry
 */
export async function calculateMetrics(
  registry: DocumentRegistry,
): Promise<SyncMetrics> {
  const allRecords = await registry.list(undefined, undefined, true);

  const metrics: SyncMetrics = {
    totalDocuments: 0,
    totalChunks: 0,
    documentsBySource: {},
    chunksBySource: {},
    documentsByScope: {},
    chunksByScope: {},
    lastSyncTime: {},
    averageSyncDuration: {},
    errorCount: 0,
    errorsBySource: {},
    deletedDocuments: 0,
    deletedBySource: {},
  };

  for (const record of allRecords) {
    // Count documents
    if (!record.deleted) {
      metrics.totalDocuments++;
    } else {
      metrics.deletedDocuments++;
    }

    // Count chunks
    metrics.totalChunks += record.chunks.length;

    // By source
    metrics.documentsBySource[record.source] =
      (metrics.documentsBySource[record.source] ?? 0) + (record.deleted ? 0 : 1);
    metrics.chunksBySource[record.source] =
      (metrics.chunksBySource[record.source] ?? 0) + record.chunks.length;

    if (record.deleted) {
      metrics.deletedBySource[record.source] =
        (metrics.deletedBySource[record.source] ?? 0) + 1;
    }

    // By scope
    metrics.documentsByScope[record.scopeId] =
      (metrics.documentsByScope[record.scopeId] ?? 0) + (record.deleted ? 0 : 1);
    metrics.chunksByScope[record.scopeId] =
      (metrics.chunksByScope[record.scopeId] ?? 0) + record.chunks.length;

    // Last sync time
    const sourceKey = record.source;
    if (
      !metrics.lastSyncTime[sourceKey] ||
      record.updatedAt > metrics.lastSyncTime[sourceKey]
    ) {
      metrics.lastSyncTime[sourceKey] = record.updatedAt;
    }
  }

  return metrics;
}



