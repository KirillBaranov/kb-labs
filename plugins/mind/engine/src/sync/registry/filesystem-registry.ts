/**
 * @module @kb-labs/mind-engine/sync/registry/filesystem-registry
 * Filesystem-based document registry implementation
 */

import { useLogger } from '@kb-labs/sdk';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { DocumentRecord } from '../types';
import type { DocumentRegistry } from './document-registry';

const getRegistryLogger = () => useLogger().child({ category: 'mind:engine:sync:registry' });

export interface FileSystemRegistryOptions {
  path: string; // Path to registry.json file
  backup?: boolean; // Create backups on changes
  backupRetention?: number; // Number of backups to keep
}

/**
 * Filesystem-based document registry
 * Stores documents in a JSON file: { "source:id:scopeId": DocumentRecord }
 */
export class FileSystemRegistry implements DocumentRegistry {
  private readonly path: string;
  private readonly backup: boolean;
  private readonly backupRetention: number;
  private cache: Map<string, DocumentRecord> | null = null;
  private cacheDirty = false;

  constructor(options: FileSystemRegistryOptions) {
    this.path = options.path;
    this.backup = options.backup ?? true;
    this.backupRetention = options.backupRetention ?? 7;
  }

  private getKey(source: string, id: string, scopeId: string): string {
    return `${source}:${id}:${scopeId}`;
  }

  private async load(): Promise<Map<string, DocumentRecord>> {
    if (this.cache && !this.cacheDirty) {
      return this.cache;
    }

    try {
      const content = await fs.readFile(this.path, 'utf-8');
      const data = JSON.parse(content) as Record<string, DocumentRecord>;
      this.cache = new Map(Object.entries(data));
      this.cacheDirty = false;
      return this.cache;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty map
        this.cache = new Map();
        return this.cache;
      }
      throw error;
    }
  }

  private async saveData(data: Map<string, DocumentRecord>): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(dirname(this.path), { recursive: true });

    // Create backup if enabled
    if (this.backup) {
      try {
        const backupPath = `${this.path}.backup.${Date.now()}`;
        if (await this.fileExists(this.path)) {
          await fs.copyFile(this.path, backupPath);
          await this.cleanupOldBackups();
        }
      } catch (error) {
        // Backup failed, but continue with save
        getRegistryLogger().warn('Failed to create backup', { error });
      }
    }

    // Write registry file
    const json = JSON.stringify(Object.fromEntries(data), null, 2);
    await fs.writeFile(this.path, json, 'utf-8');
    this.cache = data;
    this.cacheDirty = false;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const dir = dirname(this.path);
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter((f) => f.startsWith(`${this.path.split('/').pop()}.backup.`))
        .map((f) => ({
          name: f,
          path: `${dir}/${f}`,
          time: parseInt(f.split('.').pop() || '0', 10),
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent backups
      const toDelete = backupFiles.slice(this.backupRetention);
      for (const file of toDelete) {
        await fs.unlink(file.path).catch(() => {
          // Ignore errors when deleting old backups
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async save(record: DocumentRecord): Promise<void> {
    const data = await this.load();
    const key = this.getKey(record.source, record.id, record.scopeId);
    data.set(key, record);
    this.cacheDirty = true;
    await this.saveData(data);
  }

  async get(source: string, id: string, scopeId: string): Promise<DocumentRecord | null> {
    const data = await this.load();
    const key = this.getKey(source, id, scopeId);
    return data.get(key) ?? null;
  }

  async delete(source: string, id: string, scopeId: string): Promise<void> {
    const data = await this.load();
    const key = this.getKey(source, id, scopeId);
    data.delete(key);
    this.cacheDirty = true;
    await this.saveData(data);
  }

  async list(source?: string, scopeId?: string, includeDeleted = false): Promise<DocumentRecord[]> {
    const data = await this.load();
    const records: DocumentRecord[] = [];

    for (const record of data.values()) {
      // Filter by source
      if (source && record.source !== source) {
        continue;
      }

      // Filter by scope
      if (scopeId && record.scopeId !== scopeId) {
        continue;
      }

      // Filter deleted
      if (!includeDeleted && record.deleted) {
        continue;
      }

      records.push(record);
    }

    return records;
  }

  async exists(source: string, id: string, scopeId: string): Promise<boolean> {
    const record = await this.get(source, id, scopeId);
    return record !== null;
  }
}

