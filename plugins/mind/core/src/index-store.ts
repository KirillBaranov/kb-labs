/**
 * Per-index manifest persistence via `IStorage`.
 *
 * The manifest is the source of truth for the BM25 corpus and for
 * listing/status. Vectors live in the vector store; the manifest holds chunk
 * text + per-file bookkeeping. One manifest per index id.
 */

import type { IStorage } from './services';
import type { IndexManifest } from './types';

function manifestPath(indexId: string): string {
  return `mind/${indexId}/manifest.json`;
}

export async function loadManifest(storage: IStorage, indexId: string): Promise<IndexManifest> {
  const buf = await storage.read(manifestPath(indexId));
  if (!buf) {
    return { indexId, chunks: [], files: {}, updatedAt: null };
  }
  try {
    const parsed = JSON.parse(buf.toString('utf8')) as IndexManifest;
    return { indexId, chunks: parsed.chunks ?? [], files: parsed.files ?? {}, updatedAt: parsed.updatedAt ?? null };
  } catch {
    return { indexId, chunks: [], files: {}, updatedAt: null };
  }
}

export async function saveManifest(storage: IStorage, manifest: IndexManifest): Promise<void> {
  const buf = Buffer.from(JSON.stringify(manifest), 'utf8');
  await storage.write(manifestPath(manifest.indexId), buf);
}
