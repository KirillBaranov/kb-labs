/**
 * Artifacts API implementation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ArtifactsAPI, ArtifactInfo } from '@kb-labs/plugin-contracts';

export interface CreateArtifactsAPIOptions {
  outdir: string;
}

/**
 * Create ArtifactsAPI for managing output files
 */
export function createArtifactsAPI(options: CreateArtifactsAPIOptions): ArtifactsAPI {
  const { outdir } = options;

  // Ensure outdir exists
  async function ensureOutdir(): Promise<void> {
    await fs.mkdir(outdir, { recursive: true });
  }

  function artifactPath(name: string): string {
    return path.join(outdir, name);
  }

  return {
    async write(name: string, content: string | Uint8Array): Promise<string> {
      await ensureOutdir();
      const filePath = artifactPath(name);

      // Ensure parent directory exists (for nested paths like "subdir/file.txt")
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      await fs.writeFile(filePath, content);
      return filePath;
    },

    async list(): Promise<ArtifactInfo[]> {
      try {
        await ensureOutdir();
        const entries = await fs.readdir(outdir, { withFileTypes: true });

        const artifacts: ArtifactInfo[] = [];

        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = path.join(outdir, entry.name);
            const stats = await fs.stat(filePath);

            artifacts.push({
              name: entry.name,
              path: filePath,
              size: stats.size,
              createdAt: stats.ctimeMs,
            });
          }
        }

        return artifacts;
      } catch {
        return [];
      }
    },

    async read(name: string): Promise<string> {
      return fs.readFile(artifactPath(name), 'utf-8');
    },

    async readBuffer(name: string): Promise<Uint8Array> {
      const buffer = await fs.readFile(artifactPath(name));
      return new Uint8Array(buffer);
    },

    async exists(name: string): Promise<boolean> {
      try {
        await fs.access(artifactPath(name));
        return true;
      } catch {
        return false;
      }
    },

    path(name: string): string {
      return artifactPath(name);
    },
  };
}
