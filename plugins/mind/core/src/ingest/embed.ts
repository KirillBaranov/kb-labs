/**
 * Embed chunks into vector records via the platform embeddings adapter.
 */

import type { Chunk, ChunkMeta } from '../types';
import type { IEmbeddings, VectorRecord } from '../services';

export async function embedChunks(chunks: Chunk[], embeddings: IEmbeddings): Promise<VectorRecord[]> {
  if (chunks.length === 0) {
    return [];
  }

  const vectors = await embeddings.embedBatch(chunks.map((c) => c.text));

  return chunks.map((chunk, i) => {
    const meta: ChunkMeta = {
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
      kind: chunk.kind,
    };
    return { id: chunk.id, vector: vectors[i] ?? [], metadata: meta };
  });
}
