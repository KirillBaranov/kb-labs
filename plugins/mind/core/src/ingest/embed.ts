/**
 * Embed chunks into vector records via the platform embeddings adapter.
 */

import type { Chunk, ChunkMeta } from '../types';
import type { IEmbeddings, VectorRecord } from '../services';

/** Chunks embedded per request — bounds payload size and yields live progress. */
const EMBED_BATCH = 96;

function toRecord(chunk: Chunk, vector: number[]): VectorRecord {
  const meta: ChunkMeta = {
    path: chunk.path,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    text: chunk.text,
    kind: chunk.kind,
  };
  return { id: chunk.id, vector, metadata: meta };
}

/**
 * Embed chunks into vector records. Batched so the embedding stage (the slow
 * part of indexing) reports progress and never sends one oversized request.
 */
export async function embedChunks(
  chunks: Chunk[],
  embeddings: IEmbeddings,
  onProgress?: (done: number, total: number) => void,
): Promise<VectorRecord[]> {
  if (chunks.length === 0) {
    return [];
  }

  const records: VectorRecord[] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const slice = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await embeddings.embedBatch(slice.map((c) => c.text));
    slice.forEach((chunk, j) => records.push(toRecord(chunk, vectors[j] ?? [])));
    onProgress?.(records.length, chunks.length);
  }
  return records;
}
