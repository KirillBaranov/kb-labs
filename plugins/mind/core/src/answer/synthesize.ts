/**
 * Phase 2 synthesis: turn ranked chunks into wire `SearchResult`s.
 *
 * No LLM here — that arrives in Phase 4 for agent answers. This stage just
 * shapes retrieved chunks for the `search` response.
 */

import type { SearchResult } from '@kb-labs/mind-contracts';
import type { RankedChunk } from '../retrieval/retrieve';

export function toSearchResults(ranked: RankedChunk[]): SearchResult[] {
  return ranked.map(({ chunk, score }) => ({
    file: chunk.path,
    lines: [chunk.startLine, chunk.endLine],
    snippet: chunk.text,
    kind: chunk.kind,
    score,
  }));
}
