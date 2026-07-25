/**
 * @module @kb-labs/adapters-blob-storage
 * Filesystem-backed blob storage adapter implementing IStorage interface.
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-blob-storage';
 *
 * const storage = createAdapter({
 *   baseDir: '/var/data',
 * });
 *
 * await storage.write('docs/readme.md', Buffer.from('# Hello'));
 * const content = await storage.read('docs/readme.md');
 * const files = await storage.list('docs/');
 * await storage.delete('docs/readme.md');
 * ```
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  IStorage,
  StorageMetadata,
} from "@kb-labs/sdk/adapters";

// Re-export manifest
export { manifest } from "./manifest.js";

/**
 * Configuration for filesystem storage adapter.
 */
export interface FilesystemStorageConfig {
  /** Base directory for all file operations (default: process.cwd()) */
  baseDir?: string;
}

/**
 * Filesystem implementation of IStorage interface.
 */
export class FilesystemStorageAdapter implements IStorage {
  private baseDir: string;

  constructor(config: FilesystemStorageConfig = {}) {
    this.baseDir = config.baseDir ?? process.cwd();
  }

  /**
   * Resolve relative path to absolute path within baseDir.
   */
  private resolvePath(relativePath: string): string {
    // Normalize path and ensure it's within baseDir (security)
    const normalized = path.normalize(relativePath);
    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.join(this.baseDir, normalized);

    // Ensure path is within baseDir (prevent directory traversal)
    if (!absolute.startsWith(this.baseDir)) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }

    return absolute;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Recursively walk a directory, yielding absolute file paths.
   */
  private async *walk(dirPath: string): AsyncGenerator<string> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        yield* this.walk(entryPath);
      } else if (entry.isFile()) {
        yield entryPath;
      }
    }
  }

  async read(filepath: string): Promise<Buffer | null> {
    const absolutePath = this.resolvePath(filepath);

    try {
      return await fs.readFile(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async write(filepath: string, data: Buffer): Promise<void> {
    const absolutePath = this.resolvePath(filepath);

    // Ensure directory exists
    await this.ensureDir(path.dirname(absolutePath));

    await fs.writeFile(absolutePath, data);
  }

  async delete(filepath: string): Promise<void> {
    const absolutePath = this.resolvePath(filepath);

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist - that's okay
        return;
      }
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const absolutePrefix = this.resolvePath(prefix);
    const results: string[] = [];

    for await (const filePath of this.walk(absolutePrefix)) {
      results.push(path.relative(this.baseDir, filePath));
    }

    return results;
  }

  async exists(filepath: string): Promise<boolean> {
    const absolutePath = this.resolvePath(filepath);

    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // EXTENDED METHODS (optional - implements IStorage extended interface)
  // ============================================================================

  /**
   * Get file metadata (size, mtime, etc).
   * Optional method - implements IStorage.stat().
   */
  async stat(filepath: string): Promise<StorageMetadata | null> {
    const absolutePath = this.resolvePath(filepath);

    try {
      const stats = await fs.stat(absolutePath);

      return {
        path: filepath,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        contentType: this.guessContentType(filepath),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Copy file within storage.
   * Optional method - implements IStorage.copy().
   */
  async copy(sourcePath: string, destPath: string): Promise<void> {
    const absoluteSource = this.resolvePath(sourcePath);
    const absoluteDest = this.resolvePath(destPath);

    // Ensure destination directory exists
    await this.ensureDir(path.dirname(absoluteDest));

    await fs.copyFile(absoluteSource, absoluteDest);
  }

  /**
   * Move file within storage.
   * Optional method - implements IStorage.move().
   */
  async move(sourcePath: string, destPath: string): Promise<void> {
    const absoluteSource = this.resolvePath(sourcePath);
    const absoluteDest = this.resolvePath(destPath);

    // Ensure destination directory exists
    await this.ensureDir(path.dirname(absoluteDest));

    await fs.rename(absoluteSource, absoluteDest);
  }

  /**
   * List files with metadata.
   * Optional method - implements IStorage.listWithMetadata().
   */
  async listWithMetadata(prefix: string): Promise<StorageMetadata[]> {
    const absolutePrefix = this.resolvePath(prefix);
    const results: StorageMetadata[] = [];

    for await (const filePath of this.walk(absolutePrefix)) {
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(this.baseDir, filePath);

      results.push({
        path: relativePath,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        contentType: this.guessContentType(relativePath),
      });
    }

    return results;
  }

  /**
   * Guess content type from file extension.
   * Simple implementation - can be extended with mime-types library.
   */
  private guessContentType(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".html": "text/html",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
    };

    return mimeTypes[ext] ?? "application/octet-stream";
  }
}

/**
 * Create filesystem storage adapter.
 * This is the factory function called by initPlatform() when loading adapters.
 */
export function createAdapter(
  config?: FilesystemStorageConfig,
): FilesystemStorageAdapter {
  return new FilesystemStorageAdapter(config);
}

// Default export for direct import
export default createAdapter;
