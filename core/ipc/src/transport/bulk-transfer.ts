/**
 * @module @kb-labs/core-runtime/transport/bulk-transfer
 * Smart IPC transfer: inline for small payloads, temp files for large payloads.
 *
 * Problem:
 * - Unix Socket IPC has backpressure issues with large JSON payloads (>100KB)
 * - Serializing 50 vectors × 1536 floats causes 120s+ timeout
 *
 * Solution:
 * - Small payloads (< 1MB): inline JSON through IPC
 * - Large payloads (> 1MB): write to temp file, send only file ID through IPC
 *
 * Performance:
 * - Inline: ~1ms IPC overhead
 * - Temp file: ~50ms write + 1ms IPC + 30ms read = ~81ms total
 * - Qdrant upsert: 77ms
 * - Total: ~158ms per batch (vs 120s+ timeout)
 */

import { writeFile, readFile, unlink } from 'fs/promises';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Transfer protocol: inline JSON or temp file reference
 */
export interface BulkTransfer {
  type: 'inline' | 'file';
  payload: string; // JSON string if inline, absolute temp file path if file
}

/**
 * Configuration for bulk transfer behavior
 */
export interface BulkTransferOptions {
  /** Threshold: payloads larger than this use temp files (default: 1MB) */
  maxInlineSize: number;
  /** Directory for temp files (default: os.tmpdir()) */
  tempDir: string;
}

/**
 * Helper for smart IPC transfer with automatic inline/file decision
 */
export class BulkTransferHelper {
  /** Map of temp file IDs to file paths (for cleanup) */
  private static tempFiles = new Map<string, string>();

  /** Default options */
  private static defaultOptions: BulkTransferOptions = {
    maxInlineSize: 1_000_000, // 1MB
    tempDir: tmpdir(),
  };

  /**
   * Serialize data: inline for small, temp file for large
   *
   * @example
   * ```typescript
   * const transfer = await BulkTransferHelper.serialize(vectors, {
   *   maxInlineSize: 1_000_000,
   *   tempDir: '/tmp'
   * });
   *
   * if (transfer.type === 'inline') {
   *   console.log('Using inline IPC');
   * } else {
   *   console.log('Using temp file:', transfer.payload); // Absolute path like '/tmp/bulk-123.json'
   * }
   * ```
   */
  static async serialize<T>(
    data: T,
    options: Partial<BulkTransferOptions> = {}
  ): Promise<BulkTransfer> {
    const opts = { ...this.defaultOptions, ...options };
    const json = JSON.stringify(data);

    // Small payload: use inline IPC (fast path)
    if (json.length < opts.maxInlineSize) {
      return { type: 'inline', payload: json };
    }

    // Large payload: write to temp file (avoid IPC backpressure)
    const tempId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempPath = join(opts.tempDir, `${tempId}.json`);

    await writeFile(tempPath, json, 'utf8');
    this.tempFiles.set(tempPath, tempPath); // Store by path for cleanup

    return { type: 'file', payload: tempPath }; // Return absolute path, not ID
  }

  /**
   * Deserialize from inline JSON or temp file
   *
   * @example
   * ```typescript
   * const transfer = { type: 'file', payload: '/tmp/bulk-123.json' };
   * const data = await BulkTransferHelper.deserialize<VectorRecord[]>(transfer);
   * ```
   */
  static async deserialize<T>(transfer: BulkTransfer): Promise<T> {
    if (transfer.type === 'inline') {
      return JSON.parse(transfer.payload);
    }

    // transfer.payload is now absolute temp file path (cross-process compatible)
    const tempPath = transfer.payload;

    try {
      const json = await readFile(tempPath, 'utf8');
      return JSON.parse(json);
    } finally {
      // Cleanup immediately after read
      await unlink(tempPath).catch(() => {
        // Ignore errors (file might already be deleted)
      });
      this.tempFiles.delete(tempPath); // Remove from cleanup map if exists
    }
  }

  /**
   * Check if object is a BulkTransfer
   */
  static isBulkTransfer(obj: unknown): obj is BulkTransfer {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'type' in obj &&
      'payload' in obj &&
      (obj.type === 'inline' || obj.type === 'file')
    );
  }

  /**
   * Cleanup all temp files (call on process exit)
   */
  static async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.tempFiles.values()).map((path) =>
      unlink(path).catch(() => {
        // Ignore errors
      })
    );
    await Promise.all(cleanupPromises);
    this.tempFiles.clear();
  }

  /**
   * Get statistics about temp files
   */
  static getStats(): { tempFilesCount: number; tempFilePaths: string[] } {
    return {
      tempFilesCount: this.tempFiles.size,
      tempFilePaths: Array.from(this.tempFiles.values()),
    };
  }
}

// Cleanup on process exit
process.on('exit', () => {
  // Sync cleanup (process.on('exit') doesn't support async)
  for (const path of BulkTransferHelper.getStats().tempFilePaths) {
    try {
      unlinkSync(path);
    } catch {
      // Ignore
    }
  }
});

// Cleanup on uncaught errors
process.on('uncaughtException', async (error) => {
  console.error('[BulkTransferHelper] Uncaught exception, cleaning up temp files:', error);
  await BulkTransferHelper.cleanup();
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('[BulkTransferHelper] SIGINT received, cleaning up temp files');
  await BulkTransferHelper.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[BulkTransferHelper] SIGTERM received, cleaning up temp files');
  await BulkTransferHelper.cleanup();
  process.exit(0);
});
