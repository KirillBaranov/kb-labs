import path from 'node:path';
import { createHash } from 'node:crypto';
import type { IStorage } from '../adapters/storage.js';
import type { HistoryFindOptions, HistoryRecord, IHistoryStore } from './history-store.js';

export interface FileHistoryStoreOptions {
  basePath?: string;
  filePrefix?: string;
  maxRecordsPerFile?: number;
  maxFiles?: number;
}

/**
 * File-based history store using platform.storage (JSONL segments with basic rotation).
 */
export class FileHistoryStore implements IHistoryStore {
  private readonly basePath: string;
  private readonly filePrefix: string;
  private readonly maxRecordsPerFile: number;
  private readonly maxFiles: number;

  constructor(private readonly storage: IStorage, options: FileHistoryStoreOptions = {}) {
    this.basePath = options.basePath ? this.ensureTrailingSlash(options.basePath) : '.kb/mind/learning/history/';
    this.filePrefix = options.filePrefix ?? 'history-';
    this.maxRecordsPerFile = options.maxRecordsPerFile ?? 1000;
    this.maxFiles = options.maxFiles ?? 30;
  }

  async save(record: HistoryRecord): Promise<void> {
    const target = await this.getWritableFile();
    const line = JSON.stringify({ v: 1, record }) + '\n';
    try {
      const existing = await this.storage.read(target);
      const buffer = existing ? Buffer.concat([existing, Buffer.from(line, 'utf8')]) : Buffer.from(line, 'utf8');
      await this.storage.write(target, buffer);
      await this.enforceRotation();
    } catch (error) {
      // Log to stderr to avoid throwing (learning is non-critical)
       
      console.error('[FileHistoryStore] Failed to write history', {
        target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async find(options: HistoryFindOptions): Promise<HistoryRecord[]> {
    const files = await this.getFilesSorted();
    const results: HistoryRecord[] = [];
    for (const file of files) {
      if (options.limit && results.length >= options.limit) {break;}
      const buf = await this.storage.read(file);
      if (!buf) {continue;}
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        if (options.limit && results.length >= options.limit) {break;}
        try {
          const parsed = JSON.parse(line) as { v: number; record: HistoryRecord };
          const rec = parsed.record;
          if (rec.scopeId !== options.scopeId) {continue;}
          if (options.queryHash && rec.queryHash !== options.queryHash) {continue;}
          if (options.queryVector && options.queryVector.length > 0 && rec.queryVector) {
            const similarity = this.cosineSimilarity(options.queryVector, rec.queryVector);
            if (similarity <= 0.7) {continue;}
          }
          results.push(rec);
        } catch {
          continue;
        }
      }
    }
    return options.limit ? results.slice(0, options.limit) : results;
  }

  async popular(scopeId: string, limit: number = 20): Promise<Array<{ query: string; count: number }>> {
    const files = await this.getFilesSorted();
    const counts = new Map<string, number>();
    for (const file of files) {
      const buf = await this.storage.read(file);
      if (!buf) {continue;}
      const lines = buf.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as { v: number; record: HistoryRecord };
          const rec = parsed.record;
          if (rec.scopeId !== scopeId) {continue;}
          counts.set(rec.query, (counts.get(rec.query) ?? 0) + 1);
        } catch {
          continue;
        }
      }
    }
    return Array.from(counts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async saveReasoningPlan(record: HistoryRecord): Promise<void> {
    const hash = record.queryHash ?? createHash('sha256').update(record.query.toLowerCase().trim()).digest('hex');
    await this.save({ ...record, queryHash: hash });
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

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {return 0;}
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
      dot += vec1[i]! * vec2[i]!;
      norm1 += vec1[i]! * vec1[i]!;
      norm2 += vec2[i]! * vec2[i]!;
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom === 0 ? 0 : dot / denom;
  }
}

