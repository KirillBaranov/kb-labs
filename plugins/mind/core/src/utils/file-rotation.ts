/**
 * Base class for file-based stores with rotation support
 *
 * Provides JSONL file rotation, segmentation by date, and automatic cleanup.
 * Used by history stores, feedback stores, and other persistent logging mechanisms.
 */

import path from 'node:path';
import type { IStorage } from '@kb-labs/sdk';

export interface FileRotationOptions {
  /**
   * Base directory path for storing files
   * @default '.kb/mind/store/'
   */
  basePath?: string;

  /**
   * Prefix for generated filenames
   * @default 'store-'
   */
  filePrefix?: string;

  /**
   * Maximum number of records per file before rotation
   * @default 1000
   */
  maxRecordsPerFile?: number;

  /**
   * Maximum number of files to keep (oldest deleted first)
   * @default 30
   */
  maxFiles?: number;
}

/**
 * Abstract base class for file-based stores with automatic rotation
 *
 * Features:
 * - JSONL format (one JSON object per line)
 * - Date-based file segmentation (YYYYMMDD-timestamp.jsonl)
 * - Automatic rotation when maxRecordsPerFile reached
 * - Automatic cleanup when maxFiles exceeded
 * - Sorted file iteration (oldest to newest)
 *
 * @example
 * ```typescript
 * class MyStore extends FileRotationStore<MyRecord> {
 *   async save(record: MyRecord): Promise<void> {
 *     return this.appendRecord(record);
 *   }
 *
 *   async find(criteria: any): Promise<MyRecord[]> {
 *     return this.readRecords((rec) => rec.id === criteria.id);
 *   }
 * }
 * ```
 */
export abstract class FileRotationStore<TRecord> {
  protected readonly basePath: string;
  protected readonly filePrefix: string;
  protected readonly maxRecordsPerFile: number;
  protected readonly maxFiles: number;

  constructor(
    protected readonly storage: IStorage,
    options: FileRotationOptions = {}
  ) {
    this.basePath = options.basePath ? this.ensureTrailingSlash(options.basePath) : '.kb/mind/store/';
    this.filePrefix = options.filePrefix ?? 'store-';
    this.maxRecordsPerFile = options.maxRecordsPerFile ?? 1000;
    this.maxFiles = options.maxFiles ?? 30;
  }

  /**
   * Append a record to the current writable file
   *
   * Automatically handles:
   * - File rotation when maxRecordsPerFile exceeded
   * - Cleanup when maxFiles exceeded
   * - JSONL formatting
   *
   * @param record - Record to append
   */
  protected async appendRecord(record: TRecord): Promise<void> {
    const target = await this.getWritableFile();
    const line = JSON.stringify({ v: 1, record }) + '\n';

    const existing = await this.storage.read(target);
    const buffer = existing
      ? Buffer.concat([existing, Buffer.from(line, 'utf8')])
      : Buffer.from(line, 'utf8');

    await this.storage.write(target, buffer);
    await this.enforceRotation();
  }

  /**
   * Read records from all files, optionally filtering
   *
   * @param filter - Optional filter function
   * @param limit - Maximum number of records to return
   * @returns Array of records matching filter
   */
  protected async readRecords(
    filter?: (record: TRecord) => boolean,
    limit?: number
  ): Promise<TRecord[]> {
    const files = await this.getFilesSorted();
    const results: TRecord[] = [];

    for (const file of files) {
      if (limit && results.length >= limit) {break;}

      const buf = await this.storage.read(file);
      if (!buf) {continue;}

      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        if (limit && results.length >= limit) {break;}

        try {
          const parsed = JSON.parse(line) as { v: number; record: TRecord };
          const rec = parsed.record;

          if (!filter || filter(rec)) {
            results.push(rec);
          }
        } catch {
          // Skip malformed lines
          continue;
        }
      }
    }

    return limit ? results.slice(0, limit) : results;
  }

  /**
   * Get the current writable file path
   *
   * Creates a new segment if:
   * - No files exist
   * - Latest file has >= maxRecordsPerFile records
   *
   * @returns Path to writable file
   */
  protected async getWritableFile(): Promise<string> {
    const files = await this.getFilesSorted();

    if (files.length === 0) {
      return this.segmentPath(Date.now());
    }

    const latest = files[files.length - 1]!;
    const buf = await this.storage.read(latest);

    if (!buf) {return latest;}

    const count = buf.toString('utf8').split('\n').filter(Boolean).length;
    if (count >= this.maxRecordsPerFile) {
      return this.segmentPath(Date.now());
    }

    return latest;
  }

  /**
   * Get all store files sorted by timestamp (oldest to newest)
   *
   * @returns Sorted array of file paths
   */
  protected async getFilesSorted(): Promise<string[]> {
    const files = await this.storage.list(this.basePath);
    return files
      .filter((f) => f.startsWith(this.basePath + this.filePrefix) && f.endsWith('.jsonl'))
      .sort();
  }

  /**
   * Generate a segment file path from timestamp
   *
   * Format: {filePrefix}YYYYMMDD-{timestamp}.jsonl
   * Example: history-20251209-1733769000123.jsonl
   *
   * @param ts - Unix timestamp in milliseconds
   * @returns Full file path
   */
  protected segmentPath(ts: number): string {
    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const filename = `${this.filePrefix}${year}${month}${day}-${ts}.jsonl`;
    return path.posix.join(this.basePath, filename);
  }

  /**
   * Enforce file rotation by deleting oldest files if maxFiles exceeded
   */
  protected async enforceRotation(): Promise<void> {
    const files = await this.getFilesSorted();
    if (files.length <= this.maxFiles) {return;}

    const excess = files.length - this.maxFiles;
    const toDelete = files.slice(0, excess);
    await Promise.all(toDelete.map((f: string) => this.storage.delete(f)));
  }

  /**
   * Ensure path ends with trailing slash
   */
  protected ensureTrailingSlash(p: string): string {
    return p.endsWith('/') ? p : `${p}/`;
  }
}
