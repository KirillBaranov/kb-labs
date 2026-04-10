/**
 * @module @kb-labs/core-platform/wrappers/analytics-storage
 * Analytics wrapper for IStorage that tracks usage
 */

import type { IStorage } from '../adapters/storage.js';
import type { IAnalytics } from '../adapters/analytics.js';

/**
 * Generate unique request ID for tracking
 */
function generateRequestId(): string {
  return `storage_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Analytics wrapper for storage adapter.
 * Tracks all file operations including read/write bandwidth.
 */
export class AnalyticsStorage implements IStorage {
  constructor(
    private realStorage: IStorage,
    private analytics: IAnalytics
  ) {}

  async read(path: string): Promise<Buffer | null> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const result = await this.realStorage.read(path);
      const durationMs = Date.now() - startTime;
      const bytesRead = result?.length ?? 0;

      // Track read operation
      await this.analytics.track('storage.read.completed', {
        requestId,
        path,
        bytesRead,
        durationMs,
        found: result !== null,
      });

      return result;
    } catch (error) {
      await this.analytics.track('storage.read.error', {
        requestId,
        path,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async write(path: string, data: Buffer): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realStorage.write(path, data);
      const durationMs = Date.now() - startTime;

      // Track write operation
      await this.analytics.track('storage.write.completed', {
        requestId,
        path,
        bytesWritten: data.length,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('storage.write.error', {
        requestId,
        path,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async delete(path: string): Promise<void> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      await this.realStorage.delete(path);
      const durationMs = Date.now() - startTime;

      // Track delete operation
      await this.analytics.track('storage.delete.completed', {
        requestId,
        path,
        durationMs,
      });
    } catch (error) {
      await this.analytics.track('storage.delete.error', {
        requestId,
        path,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const results = await this.realStorage.list(prefix);
      const durationMs = Date.now() - startTime;

      // Track list operation
      await this.analytics.track('storage.list.completed', {
        requestId,
        prefix,
        filesCount: results.length,
        durationMs,
      });

      return results;
    } catch (error) {
      await this.analytics.track('storage.list.error', {
        requestId,
        prefix,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const result = await this.realStorage.exists(path);
      const durationMs = Date.now() - startTime;

      // Track exists check
      await this.analytics.track('storage.exists.completed', {
        requestId,
        path,
        exists: result,
        durationMs,
      });

      return result;
    } catch (error) {
      await this.analytics.track('storage.exists.error', {
        requestId,
        path,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }
}
