/**
 * Mind facade — the single object the plugin (CLI + REST) talks to.
 *
 * `createMind(services, config)` returns verbs that both the CLI commands and
 * REST handlers call identically, so behaviour is shared by construction.
 * Phase 2 ships `index` / `search` / `status`; `ask`, `sync`, `reindex` are
 * layered in later phases.
 */

import type {
  MindConfig,
  IndexRequest,
  IndexResponse,
  SearchRequest,
  SearchResponse,
  StatusResponse,
  IndexSummary,
  HealthResponse,
  QueryRequest,
  AgentResponse,
  AgentQueryMode,
  SyncResponse,
  SyncListResponse,
  SyncStatusResponse,
  ReindexRequest,
} from '@kb-labs/mind-contracts';
import type { Trace, StageTrace } from '@kb-labs/mind-contracts';
import type { MindServices } from './services';
import type { RankedChunk } from './retrieval/retrieve';
import { ingest } from './ingest/ingest';
import { syncAdd, syncUpdate, syncDelete, type SyncOptions } from './sync';
import { retrieve } from './retrieval/retrieve';
import { rerank } from './retrieval/rerank';
import { dedupRanked } from './retrieval/dedup';
import { verifySources, computeConfidence } from './answer/verify';
import { decompose } from './answer/decompose';
import { synthesizeAnswer, buildAgentResponse } from './answer/answer';
import { recordQuery } from './feedback/history';
import { toSearchResults } from './answer/synthesize';
import { loadManifest } from './index-store';

export interface Mind {
  index(req: IndexRequest): Promise<IndexResponse>;
  search(req: SearchRequest): Promise<SearchResponse>;
  ask(req: QueryRequest): Promise<AgentResponse>;
  reindex(req: ReindexRequest): Promise<IndexResponse>;
  syncAdd(paths: string[], indexId?: string): Promise<SyncResponse>;
  syncUpdate(paths: string[], indexId?: string): Promise<SyncResponse>;
  syncDelete(paths: string[], indexId?: string): Promise<SyncResponse>;
  syncList(indexId?: string): Promise<SyncListResponse>;
  syncStatus(indexId?: string): Promise<SyncStatusResponse>;
  status(indexId?: string): Promise<StatusResponse>;
  health(): Promise<HealthResponse>;
}

export interface CreateMindOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable ISO timestamp source for manifest bookkeeping. */
  isoNow?: () => string;
}

export function createMind(
  services: MindServices,
  config: MindConfig,
  options: CreateMindOptions = {},
): Mind {
  const now = options.now ?? (() => Date.now());
  const isoNow = options.isoNow ?? (() => new Date(now()).toISOString());

  function resolveIndexId(indexId?: string): string {
    return indexId && indexId.trim() !== '' ? indexId : config.defaultIndex;
  }

  function syncOpts(indexId: string): SyncOptions {
    return {
      indexId,
      chunk: { maxTokens: config.chunk.maxTokens, overlapTokens: config.chunk.overlapTokens },
      ast: config.chunk.ast,
      now: isoNow(),
    };
  }

  return {
    async index(req): Promise<IndexResponse> {
      const indexId = resolveIndexId(req.indexId);
      const start = now();
      const result = await ingest(
        {
          indexId,
          scope: req.scope,
          chunk: { maxTokens: config.chunk.maxTokens, overlapTokens: config.chunk.overlapTokens },
          ast: config.chunk.ast,
          now: isoNow(),
        },
        services,
      );
      return {
        indexId,
        filesIndexed: result.filesIndexed,
        chunks: result.chunks,
        durationMs: now() - start,
      };
    },

    async search(req): Promise<SearchResponse> {
      const indexId = resolveIndexId(req.indexId);
      const limit = req.limit ?? config.retrieval.limit;
      const stages: StageTrace[] = [];
      const timed = async <T>(stage: string, fn: () => Promise<T> | T): Promise<T> => {
        const t0 = now();
        const out = await fn();
        stages.push({ stage, durationMs: now() - t0, outputCount: Array.isArray(out) ? out.length : undefined });
        return out;
      };

      const t0 = now();
      // Over-fetch, then refine: retrieve -> rerank -> dedup -> verify.
      const retrieved = await timed('retrieve', () =>
        retrieve(
          { text: req.text, indexId, limit: limit * 3, intent: req.intent, rrfK: config.retrieval.rrfK },
          services,
        ),
      );
      let ranked = config.retrieval.rerank
        ? await timed('rerank', () => rerank(retrieved.ranked, req.text))
        : retrieved.ranked;
      if (config.retrieval.dedup) {
        ranked = await timed('dedup', () => dedupRanked(ranked));
      }
      ranked = ranked.slice(0, limit);

      const verification = await timed('verify', () => verifySources(ranked, services.storage));
      const { confidence } = computeConfidence(retrieved.confidence, verification.rate, config.confidence.floor);

      const trace: Trace = {
        requestId: `mind:${t0}`,
        mode: req.mode ?? 'auto',
        totalMs: now() - t0,
        stages,
      };

      return { results: toSearchResults(ranked), confidence, indexId, trace };
    },

    async ask(req): Promise<AgentResponse> {
      const indexId = resolveIndexId(req.indexId);
      const mode: AgentQueryMode = req.mode ?? 'auto';
      const budget = config.modes[mode];
      const t0 = now();

      // Feedback: record the query (best-effort).
      await recordQuery(services.cache, indexId, req.text, t0);

      // Decompose into sub-queries for richer modes; always retains the original.
      const queries = budget.useLLM
        ? await decompose(req.text, services.llm, budget.maxSubqueries)
        : [req.text];

      // Gather across sub-queries, merging by chunk id (keep best score).
      const merged = new Map<string, RankedChunk>();
      let retrievalConfidence = 0;
      for (const q of queries) {
        const r = await retrieve(
          { text: q, indexId, limit: budget.maxChunks, intent: undefined, rrfK: config.retrieval.rrfK },
          services,
        );
        retrievalConfidence = Math.max(retrievalConfidence, r.confidence);
        for (const rc of r.ranked) {
          const prev = merged.get(rc.chunk.id);
          if (!prev || rc.score > prev.score) {
            merged.set(rc.chunk.id, rc);
          }
        }
      }

      let ranked = config.retrieval.rerank
        ? rerank([...merged.values()], req.text)
        : [...merged.values()].sort((a, b) => b.score - a.score);
      if (config.retrieval.dedup) {
        ranked = dedupRanked(ranked);
      }
      ranked = ranked.slice(0, budget.maxChunks);

      const verification = await verifySources(ranked, services.storage);
      const { confidence, warnings } = computeConfidence(
        retrievalConfidence,
        verification.rate,
        config.confidence.floor,
      );

      const answer = await synthesizeAnswer(req.text, ranked, services.llm, budget.useLLM);

      return buildAgentResponse({
        answer,
        ranked,
        confidence,
        mode,
        requestId: `mind:${t0}`,
        timingMs: now() - t0,
        cached: false,
        floor: config.confidence.floor,
        warnings,
      });
    },

    async reindex(req): Promise<IndexResponse> {
      return this.index({ indexId: req.indexId, full: true });
    },

    async syncAdd(paths, indexId): Promise<SyncResponse> {
      const id = resolveIndexId(indexId);
      const counts = await syncAdd(paths, services, syncOpts(id));
      return { indexId: id, ...counts };
    },

    async syncUpdate(paths, indexId): Promise<SyncResponse> {
      const id = resolveIndexId(indexId);
      const counts = await syncUpdate(paths, services, syncOpts(id));
      return { indexId: id, ...counts };
    },

    async syncDelete(paths, indexId): Promise<SyncResponse> {
      const id = resolveIndexId(indexId);
      const counts = await syncDelete(paths, services, syncOpts(id));
      return { indexId: id, ...counts };
    },

    async syncList(indexId): Promise<SyncListResponse> {
      const id = resolveIndexId(indexId);
      const manifest = await loadManifest(services.storage, id);
      return {
        indexId: id,
        documents: Object.entries(manifest.files).map(([path, info]) => ({
          path,
          chunks: info.chunks,
          indexedAt: info.indexedAt,
        })),
      };
    },

    async syncStatus(indexId): Promise<SyncStatusResponse> {
      const id = resolveIndexId(indexId);
      const manifest = await loadManifest(services.storage, id);
      return {
        indexId: id,
        documents: Object.keys(manifest.files).length,
        chunks: manifest.chunks.length,
        lastIndexedAt: manifest.updatedAt,
        stale: false,
      };
    },

    async status(indexId): Promise<StatusResponse> {
      const ids = indexId ? [indexId] : await listIndexIds(services);
      const indexes: IndexSummary[] = [];
      for (const id of ids) {
        const manifest = await loadManifest(services.storage, id);
        indexes.push({
          indexId: id,
          documents: Object.keys(manifest.files).length,
          chunks: manifest.chunks.length,
          lastIndexedAt: manifest.updatedAt,
        });
      }
      return { indexes, healthy: true };
    },

    async health(): Promise<HealthResponse> {
      return {
        ok: true,
        vectorStore: Boolean(services.vectorStore),
        embeddings: Boolean(services.embeddings),
        llm: Boolean(services.llm),
      };
    },
  };
}

/** Enumerate index ids by scanning persisted manifests under `mind/`. */
async function listIndexIds(services: MindServices): Promise<string[]> {
  const paths = await services.storage.list('mind/');
  const ids = new Set<string>();
  for (const p of paths) {
    const match = /^mind\/([^/]+)\/manifest\.json$/.exec(p);
    if (match) {
      ids.add(match[1]!);
    }
  }
  return [...ids];
}
