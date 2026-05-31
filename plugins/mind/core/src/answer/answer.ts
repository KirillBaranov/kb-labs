/**
 * Answer synthesis + frozen `AgentResponse` assembly.
 *
 * Produces the `agent-response-v1` contract consumed by CLAUDE.md and the
 * task-rag skill. The response is validated against the contract zod before
 * being returned, so a drift fails loudly here rather than silently downstream.
 */

import {
  AgentResponseSchema,
  AGENT_RESPONSE_SCHEMA_VERSION,
  type AgentResponse,
  type AgentSource,
  type AgentSourcesSummary,
  type AgentWarning,
  type AgentQueryMode,
} from '@kb-labs/mind-contracts';
import type { ILLM } from '../services';
import type { RankedChunk } from '../retrieval/retrieve';

const MAX_SNIPPET_CHARS = 600;

function truncate(text: string): string {
  return text.length > MAX_SNIPPET_CHARS ? `${text.slice(0, MAX_SNIPPET_CHARS)}…` : text;
}

/** Extractive fallback answer (no LLM): the most relevant snippet, attributed. */
function extractiveAnswer(query: string, ranked: RankedChunk[]): string {
  if (ranked.length === 0) {
    return `No indexed content matched the query: "${query}".`;
  }
  const top = ranked[0]!.chunk;
  return `Most relevant source: ${top.path} (lines ${top.startLine}-${top.endLine}).\n\n${truncate(top.text)}`;
}

export async function synthesizeAnswer(
  query: string,
  ranked: RankedChunk[],
  llm: ILLM,
  useLLM: boolean,
): Promise<string> {
  if (!useLLM || ranked.length === 0) {
    return extractiveAnswer(query, ranked);
  }

  const context = ranked
    .map((r, i) => `[${i + 1}] ${r.chunk.path}:${r.chunk.startLine}-${r.chunk.endLine}\n${r.chunk.text}`)
    .join('\n\n');

  const prompt =
    `Answer the question using ONLY the provided context. Be concise and cite the ` +
    `relevant files by path. If the context does not contain the answer, say so.\n\n` +
    `Question: ${query}\n\nContext:\n${context}`;

  try {
    const { content } = await llm.complete(prompt, { temperature: 0.2, maxTokens: 800 });
    const trimmed = (content ?? '').trim();
    return trimmed.length > 0 ? trimmed : extractiveAnswer(query, ranked);
  } catch {
    return extractiveAnswer(query, ranked);
  }
}

export function toSources(ranked: RankedChunk[]): AgentSource[] {
  return ranked.map(({ chunk, score }) => ({
    file: chunk.path,
    lines: [chunk.startLine, chunk.endLine] as [number, number],
    snippet: truncate(chunk.text),
    kind: chunk.kind,
    relevance: score,
  }));
}

function summarize(sources: AgentSource[]): AgentSourcesSummary {
  let code = 0;
  let docs = 0;
  const external: Record<string, number> = {};
  for (const s of sources) {
    if (s.kind === 'code' || s.kind === 'config') {
      code++;
    } else if (s.kind === 'doc' || s.kind === 'adr') {
      docs++;
    } else {
      external[s.kind] = (external[s.kind] ?? 0) + 1;
    }
  }
  return { code, docs, external };
}

export interface BuildAgentResponseInput {
  answer: string;
  ranked: RankedChunk[];
  confidence: number;
  mode: AgentQueryMode;
  requestId: string;
  timingMs: number;
  cached: boolean;
  floor: number;
  warnings?: AgentWarning[];
}

/** Assemble + validate the frozen agent-response-v1 object. */
export function buildAgentResponse(input: BuildAgentResponseInput): AgentResponse {
  const sources = toSources(input.ranked);
  const complete = input.confidence >= input.floor && sources.length > 0;

  const response: AgentResponse = {
    answer: input.answer,
    sources,
    confidence: input.confidence,
    complete,
    sourcesSummary: summarize(sources),
    warnings: input.warnings && input.warnings.length > 0 ? input.warnings : undefined,
    meta: {
      schemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
      requestId: input.requestId,
      mode: input.mode,
      timingMs: input.timingMs,
      cached: input.cached,
      confidence: input.confidence,
      complete,
      sources: sources.length,
    },
  };

  // Fail loudly if we ever drift from the frozen contract.
  return AgentResponseSchema.parse(response);
}
