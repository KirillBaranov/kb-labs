/**
 * Update indexes API
 */

import { createIndexerContext, isTimeBudgetExceeded } from "../utils/workspace";
import { readJson, writeJson, computeJsonHash } from "../fs/json";
import { ensureMindStructure } from "../fs/ensure";
import { orchestrateIndexing } from "../orchestrator/orchestrator";
import { DEFAULT_TIME_BUDGET_MS, toPosix, sha256, getGenerator } from "@kb-labs/mind-core";
import type { UpdateOptions, DeltaReport } from "../types/index";
import type { MindIndex, ApiIndex, DepsGraph, RecentDiff } from "@kb-labs/mind-types";

/**
 * Update Mind indexes with delta indexing
 */
export async function updateIndexes(opts: UpdateOptions): Promise<DeltaReport> {
  const { cwd, changed, since, timeBudgetMs = DEFAULT_TIME_BUDGET_MS, log } = opts;
  
  // Ensure mind structure exists
  await ensureMindStructure(cwd);
  
  const startTime = Date.now();
  const logger = log || (() => {});

  try {
    // Load existing indexes
    const [
      indexData,
      apiIndexData,
      depsGraphData,
      recentDiffData,
      metaData,
      docsPrimary,
      docsLegacy
    ] = await Promise.all([
      readJson<MindIndex>(`${cwd}/.kb/mind/index.json`),
      readJson<ApiIndex>(`${cwd}/.kb/mind/api-index.json`),
      readJson<DepsGraph>(`${cwd}/.kb/mind/deps.json`),
      readJson<RecentDiff>(`${cwd}/.kb/mind/recent-diff.json`),
      readJson<any>(`${cwd}/.kb/mind/meta.json`),
      readJson<any>(`${cwd}/.kb/mind/docs.json`),
      readJson<any>(`${cwd}/.kb/mind/docs-index.json`)
    ]);
    const docsData = docsPrimary ?? docsLegacy ?? null;

    const generator = getGenerator();

    const existingIndexes: Parameters<typeof createIndexerContext>[3] = {};
    if (apiIndexData) {
      existingIndexes.apiIndex = {
        ...apiIndexData,
        files: { ...(apiIndexData.files ?? {}) },
        schemaVersion: "1.0",
        generator
      };
    }
    if (depsGraphData) {
      existingIndexes.depsGraph = {
        ...depsGraphData,
        packages: { ...(depsGraphData.packages ?? {}) },
        edges: [...(depsGraphData.edges ?? [])],
        schemaVersion: "1.0",
        generator
      };
    }
    if (recentDiffData) {
      existingIndexes.recentDiff = {
        ...recentDiffData,
        files: [...(recentDiffData.files ?? [])],
        schemaVersion: "1.0",
        generator
      };
    }

    const ctx = await createIndexerContext(cwd, timeBudgetMs, logger, existingIndexes);

    ctx.apiIndex.schemaVersion = "1.0";
    ctx.apiIndex.generator = generator;

    ctx.depsGraph.schemaVersion = "1.0";
    ctx.depsGraph.generator = generator;
    ctx.depsGraph.root = toPosix(ctx.root);
    ctx.depsGraph.packages = ctx.depsGraph.packages ?? {};
    ctx.depsGraph.edges = ctx.depsGraph.edges ?? [];

    ctx.recentDiff.schemaVersion = "1.0";
    ctx.recentDiff.generator = generator;
    ctx.recentDiff.since = ctx.recentDiff.since ?? since ?? "";
    ctx.recentDiff.files = ctx.recentDiff.files ?? [];

    let baseIndex: MindIndex = indexData ?? {
      schemaVersion: "1.0",
      generator,
      updatedAt: new Date().toISOString(),
      root: toPosix(ctx.root),
      filesIndexed: 0,
      apiIndexHash: "",
      depsHash: "",
      recentDiffHash: "",
      indexChecksum: ""
    };
    baseIndex = {
      ...baseIndex,
      schemaVersion: "1.0",
      generator,
      root: toPosix(ctx.root)
    };

    const metaIndex = metaData ?? {};
    const docsIndex = docsData ?? {};

    // Check time budget
    if (isTimeBudgetExceeded(ctx)) {
      logger({ level: 'warn', code: 'MIND_TIME_BUDGET', msg: 'Time budget exceeded before processing' });
      return {
        api: { added: 0, updated: 0, removed: 0 },
        budget: { limitMs: timeBudgetMs, usedMs: Date.now() - startTime },
        partial: true,
        durationMs: Date.now() - startTime
      };
    }

    // Use orchestrator for actual indexing
    const result = await orchestrateIndexing(ctx, changed || [], since);

    // Update index with new hashes
    const now = new Date().toISOString();

    const [
      freshApiIndex,
      freshDepsGraph,
      freshRecentDiff,
      freshMeta,
      freshDocsPrimary,
      freshDocsLegacy
    ] = await Promise.all([
      readJson<ApiIndex>(`${cwd}/.kb/mind/api-index.json`).then(res => res ?? ctx.apiIndex),
      readJson<DepsGraph>(`${cwd}/.kb/mind/deps.json`).then(res => res ?? ctx.depsGraph),
      readJson<RecentDiff>(`${cwd}/.kb/mind/recent-diff.json`).then(res => res ?? ctx.recentDiff),
      readJson<any>(`${cwd}/.kb/mind/meta.json`).then(res => res ?? metaIndex),
      readJson<any>(`${cwd}/.kb/mind/docs.json`),
      readJson<any>(`${cwd}/.kb/mind/docs-index.json`)
    ]);
    const freshDocs = freshDocsPrimary ?? freshDocsLegacy ?? docsIndex;

    // Compute combined checksum with conditional recentDiff to avoid volatility
    interface ChecksumInput {
      apiIndex: ApiIndex;
      deps: DepsGraph;
      meta: any;
      docs: any;
      recentDiff?: RecentDiff;
    }

    const hashInputs: ChecksumInput = {
      apiIndex: freshApiIndex,
      deps: freshDepsGraph,
      meta: freshMeta,
      docs: freshDocs
    };

    // Only include recentDiff if present (avoids checksum changes on empty diffs)
    if ((freshRecentDiff?.files?.length ?? 0) > 0) {
      hashInputs.recentDiff = freshRecentDiff;
    }

    const indexChecksum = sha256(JSON.stringify(hashInputs));

    const updatedIndex: MindIndex = {
      ...baseIndex,
      updatedAt: now,
      root: toPosix(ctx.root),
      filesIndexed: Object.keys(freshApiIndex.files ?? {}).length,
      apiIndexHash: computeJsonHash(freshApiIndex),
      depsHash: computeJsonHash(freshDepsGraph),
      recentDiffHash: computeJsonHash(freshRecentDiff),
      indexChecksum
    };

    await writeJson(`${cwd}/.kb/mind/index.json`, updatedIndex);

    return result;
  } catch (error: any) {
    logger({ level: 'error', msg: 'Failed to update indexes', error: error.message });
    throw error;
  }
}
