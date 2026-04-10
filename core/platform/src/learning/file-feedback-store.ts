import path from 'node:path';
import type { IStorage } from '../adapters/storage.js';
import type { FeedbackRecord, IFeedbackStore } from './feedback-store.js';

export interface FileFeedbackStoreOptions {
  basePath?: string;
  filePrefix?: string;
  maxRecordsPerFile?: number;
  maxFiles?: number;
}

/**
 * File-based feedback store using platform.storage (JSONL segments with basic rotation).
 */
export class FileFeedbackStore implements IFeedbackStore {
  private readonly basePath: string;
  private readonly filePrefix: string;
  private readonly maxRecordsPerFile: number;
  private readonly maxFiles: number;

  constructor(private readonly storage: IStorage, options: FileFeedbackStoreOptions = {}) {
    this.basePath = options.basePath ? this.ensureTrailingSlash(options.basePath) : '.kb/mind/learning/feedback/';
    this.filePrefix = options.filePrefix ?? 'feedback-';
    this.maxRecordsPerFile = options.maxRecordsPerFile ?? 1000;
    this.maxFiles = options.maxFiles ?? 30;
  }

  async save(record: FeedbackRecord): Promise<void> {
    const target = await this.getWritableFile();
    const line = JSON.stringify({ v: 1, record }) + '\n';
    try {
      const existing = await this.storage.read(target);
      const buffer = existing ? Buffer.concat([existing, Buffer.from(line, 'utf8')]) : Buffer.from(line, 'utf8');
      await this.storage.write(target, buffer);
      await this.enforceRotation();
    } catch (error) {
       
      console.error('[FileFeedbackStore] Failed to write feedback', {
        target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async list(scopeId: string, limit: number = 100): Promise<FeedbackRecord[]> {
    const files = await this.getFilesSorted();
    const results: FeedbackRecord[] = [];
    for (const file of files) {
      if (results.length >= limit) {break;}
      const buf = await this.storage.read(file);
      if (!buf) {continue;}
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        if (results.length >= limit) {break;}
        try {
          const parsed = JSON.parse(line) as { v: number; record: FeedbackRecord };
          const rec = parsed.record;
          if (rec.scopeId !== scopeId) {continue;}
          results.push(rec);
        } catch {
          continue;
        }
      }
    }
    return results.slice(-limit);
  }

  private async getWritableFile(): Promise<string> {
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

  private async getFilesSorted(): Promise<string[]> {
    const files = await this.storage.list(this.basePath);
    return files
      .filter((f) => f.startsWith(this.basePath + this.filePrefix) && f.endsWith('.jsonl'))
      .sort();
  }

  private segmentPath(ts: number): string {
    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const filename = `${this.filePrefix}${year}${month}${day}-${ts}.jsonl`;
    return path.posix.join(this.basePath, filename);
  }

  private async enforceRotation(): Promise<void> {
    const files = await this.getFilesSorted();
    if (files.length <= this.maxFiles) {return;}
    const excess = files.length - this.maxFiles;
    const toDelete = files.slice(0, excess);
    await Promise.all(toDelete.map((f) => this.storage.delete(f)));
  }

  private ensureTrailingSlash(p: string): string {
    return p.endsWith('/') ? p : `${p}/`;
  }
}

