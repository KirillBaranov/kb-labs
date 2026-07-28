import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rename, stat as statFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { IStorage, StorageMetadata } from "@kb-labs/sdk/adapters";

export { manifest } from "./manifest.js";

export interface FilesystemStorageConfig {
  baseDir?: string;
}

const MIME_BY_SUFFIX: Readonly<Record<string, string>> = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "application/typescript",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

function mimeFor(filePath: string): string {
  return MIME_BY_SUFFIX[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** A small, dependency-free storage implementation backed by one directory. */
export class DiskStorageAdapter implements IStorage {
  private readonly root: string;

  constructor(options: FilesystemStorageConfig = {}) {
    this.root = resolve(options.baseDir ?? process.cwd());
  }

  private insideRoot(input: string): string {
    const cleaned = normalize(input);
    const candidate = resolve(this.root, cleaned);
    const remainder = relative(this.root, candidate);

    if (isAbsolute(input) || remainder === ".." || remainder.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      throw new Error(`Path traversal detected: ${input}`);
    }

    return candidate;
  }

  private async makeParent(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
  }

  private async *filesUnder(directory: string): AsyncGenerator<string> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* this.filesUnder(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }

  private metadata(filePath: string, size: number, modified: Date): StorageMetadata {
    const pathFromRoot = relative(this.root, filePath);
    return {
      path: pathFromRoot,
      size,
      lastModified: modified.toISOString(),
      contentType: mimeFor(pathFromRoot),
    };
  }

  async read(filePath: string): Promise<Buffer | null> {
    const target = this.insideRoot(filePath);
    try {
      return await readFile(target);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async write(filePath: string, data: Buffer): Promise<void> {
    const target = this.insideRoot(filePath);
    await this.makeParent(target);
    await writeFile(target, data);
  }

  async delete(filePath: string): Promise<void> {
    try {
      await unlink(this.insideRoot(filePath));
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const start = this.insideRoot(prefix);
    const found: string[] = [];
    for await (const file of this.filesUnder(start)) found.push(relative(this.root, file));
    return found;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(this.insideRoot(filePath));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      return false;
    }
  }

  async readStream(filePath: string): Promise<NodeJS.ReadableStream | null> {
    const target = this.insideRoot(filePath);
    try {
      await access(target);
      return createReadStream(target);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async writeStream(filePath: string, stream: NodeJS.ReadableStream): Promise<void> {
    const target = this.insideRoot(filePath);
    await this.makeParent(target);
    await pipeline(stream, createWriteStream(target));
  }

  async stat(filePath: string): Promise<StorageMetadata | null> {
    const target = this.insideRoot(filePath);
    try {
      const info = await statFile(target);
      return this.metadata(target, info.size, info.mtime);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    const from = this.insideRoot(source);
    const to = this.insideRoot(destination);
    await this.makeParent(to);
    await copyFile(from, to);
  }

  async move(source: string, destination: string): Promise<void> {
    const from = this.insideRoot(source);
    const to = this.insideRoot(destination);
    await this.makeParent(to);
    await rename(from, to);
  }

  async listWithMetadata(prefix: string): Promise<StorageMetadata[]> {
    const start = this.insideRoot(prefix);
    const output: StorageMetadata[] = [];
    for await (const file of this.filesUnder(start)) {
      const info = await statFile(file);
      output.push(this.metadata(file, info.size, info.mtime));
    }
    return output;
  }
}

export function createAdapter(config?: FilesystemStorageConfig): DiskStorageAdapter {
  return new DiskStorageAdapter(config);
}

export default createAdapter;
