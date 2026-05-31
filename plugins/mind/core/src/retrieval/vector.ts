/**
 * Vector retrieval via the platform vector store, scoped by namespace=indexId.
 */

import type { IVectorStore } from '../services';
import type { Ranked } from './bm25';

export async function vectorSearch(
  queryText: string,
  vectorStore: IVectorStore,
  embed: (text: string) => Promise<number[]>,
  indexId: string,
  limit: number,
): Promise<Ranked[]> {
  const vector = await embed(queryText);
  const hits = await vectorStore.search(vector, limit, undefined, indexId);
  return hits.map((h) => ({ id: h.id, score: h.score }));
}
