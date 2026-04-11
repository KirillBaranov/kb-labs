/**
 * @module @kb-labs/rest-api-app/routes/adapters
 * Platform adapter analytics endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { platform } from '@kb-labs/core-runtime';

/**
 * LLM usage statistics response
 */
interface LLMUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  costPer1KTokens: number; // Enhanced: Cost efficiency metric
  // Cache savings
  totalCacheReadTokens: number;
  totalBillableTokens: number;
  totalCacheSavingsUsd: number;
  byModel: Record<
    string,
    {
      requests: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost: number;
      costPer1KTokens: number; // Enhanced: Cost per 1K tokens for this model
      tokensPerRequest: number; // Enhanced: Average tokens per request
      errorRate: number; // Enhanced: Error rate percentage (0-100)
      avgDurationMs: number;
      // Enhanced: Latency percentiles
      p50DurationMs: number;
      p95DurationMs: number;
      p99DurationMs: number;
      // Cache savings per model
      cacheReadTokens: number;
      billableTokens: number;
      cacheSavingsUsd: number;
    }
  >;
  errors: number;
  // Enhanced: Error breakdown by type
  errorBreakdown: {
    timeout: number;
    rateLimit: number;
    invalidRequest: number;
    serverError: number;
    other: number;
  };
  timeRange: {
    from: string;
    to: string;
  };
}

/**
 * Helper to get event data, supporting both kb.v1 (payload) and legacy (properties) formats
 */
function getEventData(event: any): Record<string, unknown> {
  // kb.v1 format uses 'payload'
  if (event.schema === 'kb.v1' && event.payload) {
    return event.payload as Record<string, unknown>;
  }
  // Legacy format uses 'properties'
  return (event.properties as Record<string, unknown>) || {};
}

/**
 * Extract date range from query parameters
 */
function extractDateRange(query: any): { from?: string; to?: string } {
  // Handle null/undefined query
  if (!query) {
    return { from: undefined, to: undefined };
  }

  const from = query.from as string | undefined;
  const to = query.to as string | undefined;

  // Validate ISO 8601 format
  if (from && !isValidISODate(from)) {
    throw new Error('Invalid "from" date format. Expected ISO 8601 datetime (e.g., 2026-01-01T00:00:00Z)');
  }
  if (to && !isValidISODate(to)) {
    throw new Error('Invalid "to" date format. Expected ISO 8601 datetime (e.g., 2026-01-31T23:59:59Z)');
  }

  return { from, to };
}

/**
 * Extract model filter from query parameters
 * Supports both single model (?models=gpt-4) and multiple (?models=gpt-4,claude-sonnet)
 */
function extractModelFilter(query: any): string[] | undefined {
  if (!query || !query.models) {
    return undefined;
  }

  const modelsParam = query.models as string;

  // Split by comma and trim whitespace
  const models = modelsParam
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  return models.length > 0 ? models : undefined;
}

/**
 * Extract StatsQuery fields (groupBy, breakdownBy, metrics) from query parameters.
 * These are optional — adapters silently ignore fields they don't support.
 */
function extractStatsOptions(query: any): {
  groupBy?: 'hour' | 'day' | 'week' | 'month';
  breakdownBy?: string;
  metrics?: string[];
} {
  if (!query) {return {};}

  const groupBy = query.groupBy as string | undefined;
  const validGroupBy = ['hour', 'day', 'week', 'month'];
  const resolvedGroupBy =
    groupBy && validGroupBy.includes(groupBy)
      ? (groupBy as 'hour' | 'day' | 'week' | 'month')
      : undefined;

  const breakdownBy = query.breakdownBy as string | undefined;

  const metricsParam = query.metrics as string | undefined;
  const metrics = metricsParam
    ? metricsParam
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    : undefined;

  return {
    groupBy: resolvedGroupBy,
    breakdownBy: breakdownBy || undefined,
    metrics: metrics && metrics.length > 0 ? metrics : undefined,
  };
}

/**
 * Fetch all events for a given query in batches to avoid memory issues.
 *
 * Backend handles pagination internally:
 * - PAGE_SIZE: 10,000 events per request
 * - MAX_EVENTS: 100,000 total events to process
 *
 * Frontend just sends date range, backend fetches all events in that range.
 *
 * @param analytics - Analytics adapter
 * @param query - Event query (type, from, to)
 * @param fastify - Fastify instance for logging
 * @returns All events (up to MAX_EVENTS)
 */
async function fetchAllEventsBatched(
  analytics: any,
  query: { type: string | string[]; from?: string; to?: string },
  fastify: FastifyInstance
): Promise<any[]> {
  const PAGE_SIZE = 10000;
  const MAX_EVENTS = 100000;

  const allEvents: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && allEvents.length < MAX_EVENTS) {
    const response = await analytics.getEvents({
      ...query,
      limit: PAGE_SIZE,
      offset,
    });

    allEvents.push(...response.events);
    hasMore = response.hasMore;
    offset += PAGE_SIZE;

    // Stop if we've fetched all events or page not full
    if (!hasMore || response.events.length < PAGE_SIZE) {
      break;
    }
  }

  // Warn if we hit the safety limit
  if (allEvents.length >= MAX_EVENTS) {
    fastify.log.warn({ query }, `Hit max events limit (${MAX_EVENTS}) for query. Some events excluded from stats.`);
  }

  return allEvents;
}

/**
 * Basic ISO 8601 validation
 */
function isValidISODate(dateString: string): boolean {
  // Check if it's a string
  if (typeof dateString !== 'string' || dateString.length === 0) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Register platform adapter analytics routes
 */
export async function registerAdaptersRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  // GET /api/v1/adapters/llm/usage
  // Returns aggregated LLM usage statistics
  const llmUsagePaths = resolvePaths(basePath, '/adapters/llm/usage');
  for (const path of llmUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      // Check if analytics supports reading
      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        // Fetch ALL LLM completion events in batches (backend handles pagination)
        const completedEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: ['llm.completion.completed', 'llm.chatWithTools.completed'],
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        // Fetch ALL error events in batches
        const errorEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: ['llm.completion.error', 'llm.chatWithTools.error'],
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        // Aggregate statistics
        const stats: LLMUsageStats = {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          costPer1KTokens: 0,
          totalCacheReadTokens: 0,
          totalBillableTokens: 0,
          totalCacheSavingsUsd: 0,
          byModel: {},
          errors: errorEvents.length,
          errorBreakdown: {
            timeout: 0,
            rateLimit: 0,
            invalidRequest: 0,
            serverError: 0,
            other: 0,
          },
          timeRange: {
            from: '',
            to: '',
          },
        };

        // Collect durations per model for percentile calculation
        const durationsByModel: Record<string, number[]> = {};

        // Track errors per model
        const errorsByModel: Record<string, number> = {};

        // Process completed events
        for (const event of completedEvents) {
          const props = getEventData(event);

          const model = (props.model || 'unknown') as string;
          const promptTokens = Number(props.promptTokens || 0);
          const completionTokens = Number(props.completionTokens || 0);
          const totalTokens = Number(props.totalTokens || promptTokens + completionTokens);
          const estimatedCost = Number(props.estimatedCost || 0);
          const durationMs = Number(props.durationMs || 0);
          const cacheReadTokens = Number(props.cacheReadTokens || 0);
          const billableTokens = Number(props.billableTotalTokens || totalTokens);
          const cacheSavingsUsd = Number(props.estimatedCacheSavingsUsd || 0);

          stats.totalRequests++;
          stats.totalTokens += totalTokens;
          stats.totalCost += estimatedCost;
          stats.totalCacheReadTokens += cacheReadTokens;
          stats.totalBillableTokens += billableTokens;
          stats.totalCacheSavingsUsd += cacheSavingsUsd;

          if (!stats.byModel[model]) {
            stats.byModel[model] = {
              requests: 0,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              cost: 0,
              costPer1KTokens: 0,
              tokensPerRequest: 0,
              errorRate: 0,
              avgDurationMs: 0,
              p50DurationMs: 0,
              p95DurationMs: 0,
              p99DurationMs: 0,
              cacheReadTokens: 0,
              billableTokens: 0,
              cacheSavingsUsd: 0,
            };
            durationsByModel[model] = [];
          }

          const modelStats = stats.byModel[model]!;
          modelStats.requests++;
          modelStats.promptTokens += promptTokens;
          modelStats.completionTokens += completionTokens;
          modelStats.totalTokens += totalTokens;
          modelStats.cost += estimatedCost;
          modelStats.cacheReadTokens += cacheReadTokens;
          modelStats.billableTokens += billableTokens;
          modelStats.cacheSavingsUsd += cacheSavingsUsd;
          modelStats.avgDurationMs =
            (modelStats.avgDurationMs * (modelStats.requests - 1) + durationMs) / modelStats.requests;

          // Collect duration for percentile calculation
          durationsByModel[model]!.push(durationMs);
        }

        // Process error events for breakdown
        for (const event of errorEvents) {
          const props = getEventData(event);
          const errorType = String(props.errorType || props.errorCode || '').toLowerCase();
          const errorMessage = String(props.error || props.message || '').toLowerCase();
          const model = (props.model || 'unknown') as string;

          // Track errors per model
          errorsByModel[model] = (errorsByModel[model] || 0) + 1;

          // Categorize error by type
          if (errorType.includes('timeout') || errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
            stats.errorBreakdown.timeout++;
          } else if (errorType.includes('rate') || errorType.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('quota exceeded')) {
            stats.errorBreakdown.rateLimit++;
          } else if (errorType.includes('invalid') || errorType.includes('validation') || errorMessage.includes('invalid request') || errorMessage.includes('bad request')) {
            stats.errorBreakdown.invalidRequest++;
          } else if (errorType.includes('server') || errorType.includes('5xx') || errorMessage.includes('internal error') || errorMessage.includes('server error')) {
            stats.errorBreakdown.serverError++;
          } else {
            stats.errorBreakdown.other++;
          }
        }

        // Calculate percentiles and cost per 1K tokens for each model
        for (const [model, durations] of Object.entries(durationsByModel)) {
          const modelStats = stats.byModel[model]!;

          // Calculate percentiles
          if (durations.length > 0) {
            const sorted = durations.slice().sort((a, b) => a - b);
            const p50Index = Math.floor(sorted.length * 0.5);
            const p95Index = Math.floor(sorted.length * 0.95);
            const p99Index = Math.floor(sorted.length * 0.99);

            modelStats.p50DurationMs = sorted[p50Index] ?? 0;
            modelStats.p95DurationMs = sorted[p95Index] ?? 0;
            modelStats.p99DurationMs = sorted[p99Index] ?? 0;
          }

          // Calculate cost per 1K tokens
          if (modelStats.totalTokens > 0) {
            modelStats.costPer1KTokens = (modelStats.cost / modelStats.totalTokens) * 1000;
          }

          // Calculate tokens per request
          if (modelStats.requests > 0) {
            modelStats.tokensPerRequest = modelStats.totalTokens / modelStats.requests;
          }

          // Calculate error rate percentage
          const modelErrors = errorsByModel[model] || 0;
          const totalModelRequests = modelStats.requests + modelErrors;
          if (totalModelRequests > 0) {
            modelStats.errorRate = (modelErrors / totalModelRequests) * 100;
          }
        }

        // Calculate overall cost per 1K tokens
        if (stats.totalTokens > 0) {
          stats.costPer1KTokens = (stats.totalCost / stats.totalTokens) * 1000;
        }

        // Calculate time range
        const allTimestamps = completedEvents.map((e) => e.ts);
        if (allTimestamps.length > 0) {
          stats.timeRange.from = allTimestamps[allTimestamps.length - 1]!; // oldest
          stats.timeRange.to = allTimestamps[0]!; // newest
        }

        return {
          ok: true,
          data: stats,
          meta: {
            source: 'analytics-adapter',
            totalEvents: completedEvents.length,
          },
        };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        platform.logger.error('Failed to fetch LLM usage stats', error instanceof Error ? error : new Error(String(error)));

        return reply.code(500).send({
          ok: false,
          error: {
            code: 'LLM_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch LLM usage statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/llm/daily-stats
  // Returns time-bucketed aggregated LLM statistics for time-series visualization
  // Query params: from, to, groupBy (hour|day|week|month), breakdownBy (dot-path), metrics (csv), models (csv, legacy filter)
  const llmDailyStatsPaths = resolvePaths(basePath, '/adapters/llm/daily-stats');
  for (const path of llmDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);
        const statsOptions = extractStatsOptions(request.query);
        const modelFilter = extractModelFilter(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['llm.completion.completed', 'llm.chatWithTools.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 50000,
          // Legacy ?models= filter maps to source filter via getEvents inside the adapter.
          // When breakdownBy is provided explicitly it takes precedence.
          // Models filter is handled post-aggregation below for backward compat.
          ...statsOptions,
        });

        // Legacy model filter: post-filter rows by breakdown value when models param is used
        // without an explicit breakdownBy (backward compatibility with existing Studio pages)
        const result =
          modelFilter && modelFilter.length > 0 && !statsOptions.breakdownBy
            ? dailyStats.filter((s) => !s.breakdown || modelFilter.includes(s.breakdown))
            : dailyStats;

        return reply.send({ ok: true, data: result });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_DATE_RANGE', message: error.message },
          });
        }
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/embeddings/daily-stats
  // Returns time-bucketed aggregated Embeddings statistics for time-series visualization
  // Query params: from, to, groupBy (hour|day|week|month), breakdownBy (dot-path), metrics (csv)
  const embeddingsDailyStatsPaths = resolvePaths(basePath, '/adapters/embeddings/daily-stats');
  for (const path of embeddingsDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);
        const statsOptions = extractStatsOptions(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['embeddings.embed.completed', 'embeddings.embedBatch.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 50000,
          ...statsOptions,
        });

        return reply.send({ ok: true, data: dailyStats });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_DATE_RANGE', message: error.message },
          });
        }
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/embeddings/usage
  // Returns aggregated Embeddings usage statistics
  const embeddingsUsagePaths = resolvePaths(basePath, '/adapters/embeddings/usage');
  for (const path of embeddingsUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const completedEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: ['embeddings.embed.completed', 'embeddings.embedBatch.completed'],
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const errorEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: ['embeddings.embed.error', 'embeddings.embedBatch.error'],
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const stats = {
          totalRequests: completedEvents.length,
          totalTextLength: 0,
          totalCost: 0,
          costPer1KChars: 0, // Enhanced: Cost efficiency metric
          errors: errorEvents.length,
          // Enhanced: Error breakdown by type
          errorBreakdown: {
            timeout: 0,
            rateLimit: 0,
            invalidRequest: 0,
            serverError: 0,
            other: 0,
          },
          avgDurationMs: 0,
          // Enhanced: Latency percentiles
          p50DurationMs: 0,
          p95DurationMs: 0,
          p99DurationMs: 0,
          batchRequests: 0,
          singleRequests: 0,
          avgBatchSize: 0,
        };

        let totalDuration = 0;
        let totalBatchSize = 0;
        const durations: number[] = [];

        for (const event of completedEvents) {
          const props = getEventData(event);

          const textLength = Number(props.textLength || props.totalTextLength || 0);
          const cost = Number(props.estimatedCost || 0);
          const duration = Number(props.durationMs || 0);
          const batchSize = Number(props.batchSize || 1);

          stats.totalTextLength += textLength;
          stats.totalCost += cost;
          totalDuration += duration;
          durations.push(duration);

          if (batchSize > 1) {
            stats.batchRequests++;
            totalBatchSize += batchSize;
          } else {
            stats.singleRequests++;
          }
        }

        stats.avgDurationMs = stats.totalRequests > 0 ? totalDuration / stats.totalRequests : 0;
        stats.avgBatchSize = stats.batchRequests > 0 ? totalBatchSize / stats.batchRequests : 0;

        // Calculate percentiles
        if (durations.length > 0) {
          const sorted = durations.slice().sort((a, b) => a - b);
          const p50Index = Math.floor(sorted.length * 0.5);
          const p95Index = Math.floor(sorted.length * 0.95);
          const p99Index = Math.floor(sorted.length * 0.99);

          stats.p50DurationMs = sorted[p50Index] ?? 0;
          stats.p95DurationMs = sorted[p95Index] ?? 0;
          stats.p99DurationMs = sorted[p99Index] ?? 0;
        }

        // Calculate cost per 1K characters
        if (stats.totalTextLength > 0) {
          stats.costPer1KChars = (stats.totalCost / stats.totalTextLength) * 1000;
        }

        // Process error events for breakdown
        for (const event of errorEvents) {
          const props = getEventData(event);
          const errorType = String(props.errorType || props.errorCode || '').toLowerCase();
          const errorMessage = String(props.error || props.message || '').toLowerCase();

          // Categorize error by type
          if (errorType.includes('timeout') || errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
            stats.errorBreakdown.timeout++;
          } else if (errorType.includes('rate') || errorType.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('quota exceeded')) {
            stats.errorBreakdown.rateLimit++;
          } else if (errorType.includes('invalid') || errorType.includes('validation') || errorMessage.includes('invalid request') || errorMessage.includes('bad request')) {
            stats.errorBreakdown.invalidRequest++;
          } else if (errorType.includes('server') || errorType.includes('5xx') || errorMessage.includes('internal error') || errorMessage.includes('server error')) {
            stats.errorBreakdown.serverError++;
          } else {
            stats.errorBreakdown.other++;
          }
        }

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        platform.logger.error('Failed to fetch Embeddings usage stats', error instanceof Error ? error : new Error(String(error)));
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'EMBEDDINGS_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch embeddings statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/vectorstore/daily-stats
  // Returns time-bucketed aggregated VectorStore statistics for time-series visualization
  // Query params: from, to, groupBy (hour|day|week|month), breakdownBy (dot-path), metrics (csv)
  const vectorstoreDailyStatsPaths = resolvePaths(basePath, '/adapters/vectorstore/daily-stats');
  for (const path of vectorstoreDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);
        const statsOptions = extractStatsOptions(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['vectorstore.search.completed', 'vectorstore.upsert.completed', 'vectorstore.delete.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 50000,
          ...statsOptions,
        });

        return reply.send({ ok: true, data: dailyStats });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_DATE_RANGE', message: error.message },
          });
        }
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/vectorstore/usage
  // Returns aggregated VectorStore usage statistics
  const vectorstoreUsagePaths = resolvePaths(basePath, '/adapters/vectorstore/usage');
  for (const path of vectorstoreUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const searchEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'vectorstore.search.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const upsertEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'vectorstore.upsert.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const deleteEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'vectorstore.delete.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const stats = {
          searchQueries: searchEvents.length,
          upsertOperations: upsertEvents.length,
          deleteOperations: deleteEvents.length,
          avgSearchDuration: 0,
          // Enhanced: Search latency percentiles
          p50SearchDuration: 0,
          p95SearchDuration: 0,
          p99SearchDuration: 0,
          avgSearchScore: 0,
          avgResultsCount: 0,
          totalVectorsUpserted: 0,
          totalVectorsDeleted: 0,
        };

        let totalSearchDuration = 0;
        let totalSearchScore = 0;
        let totalResultsCount = 0;
        const searchDurations: number[] = [];

        for (const event of searchEvents) {
          const props = getEventData(event);

          const duration = Number(props.durationMs || 0);
          const avgScore = Number(props.avgScore || 0);
          const resultsCount = Number(props.resultsCount || 0);

          totalSearchDuration += duration;
          totalSearchScore += avgScore;
          totalResultsCount += resultsCount;
          searchDurations.push(duration);
        }

        stats.avgSearchDuration = stats.searchQueries > 0 ? totalSearchDuration / stats.searchQueries : 0;
        stats.avgSearchScore = stats.searchQueries > 0 ? totalSearchScore / stats.searchQueries : 0;
        stats.avgResultsCount = stats.searchQueries > 0 ? totalResultsCount / stats.searchQueries : 0;

        // Calculate search latency percentiles
        if (searchDurations.length > 0) {
          const sorted = searchDurations.slice().sort((a, b) => a - b);
          const p50Index = Math.floor(sorted.length * 0.5);
          const p95Index = Math.floor(sorted.length * 0.95);
          const p99Index = Math.floor(sorted.length * 0.99);

          stats.p50SearchDuration = sorted[p50Index] ?? 0;
          stats.p95SearchDuration = sorted[p95Index] ?? 0;
          stats.p99SearchDuration = sorted[p99Index] ?? 0;
        }

        for (const event of upsertEvents) {
          const props = getEventData(event);
          stats.totalVectorsUpserted += Number(props.vectorCount || 0);
        }

        for (const event of deleteEvents) {
          const props = getEventData(event);
          stats.totalVectorsDeleted += Number(props.idsCount || 0);
        }

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        platform.logger.error('Failed to fetch VectorStore usage stats', error instanceof Error ? error : new Error(String(error)));
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'VECTORSTORE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch vectorstore statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/cache/daily-stats
  // Returns time-bucketed aggregated Cache statistics for time-series visualization
  // Query params: from, to, groupBy (hour|day|week|month), breakdownBy (dot-path), metrics (csv)
  const cacheDailyStatsPaths = resolvePaths(basePath, '/adapters/cache/daily-stats');
  for (const path of cacheDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);
        const statsOptions = extractStatsOptions(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['cache.get.hit', 'cache.get.miss', 'cache.set.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 50000,
          ...statsOptions,
        });

        return reply.send({ ok: true, data: dailyStats });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_DATE_RANGE', message: error.message },
          });
        }
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/cache/usage
  // Returns aggregated Cache usage statistics
  const cacheUsagePaths = resolvePaths(basePath, '/adapters/cache/usage');
  for (const path of cacheUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const hitEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'cache.get.hit',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );
        const missEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'cache.get.miss',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );
        const setEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'cache.set.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const totalGets = hitEvents.length + missEvents.length;
        const hitRate = totalGets > 0 ? (hitEvents.length / totalGets) * 100 : 0;

        const stats = {
          totalGets,
          hits: hitEvents.length,
          misses: missEvents.length,
          hitRate,
          sets: setEvents.length,
          avgGetDuration: 0,
          avgSetDuration: 0,
        };

        let totalGetDuration = 0;
        for (const event of [...hitEvents, ...missEvents]) {
          const props = getEventData(event);
          totalGetDuration += Number(props.durationMs || 0);
        }
        stats.avgGetDuration = totalGets > 0 ? totalGetDuration / totalGets : 0;

        let totalSetDuration = 0;
        for (const event of setEvents) {
          const props = getEventData(event);
          totalSetDuration += Number(props.durationMs || 0);
        }
        stats.avgSetDuration = stats.sets > 0 ? totalSetDuration / stats.sets : 0;

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        platform.logger.error('Failed to fetch Cache usage stats', error instanceof Error ? error : new Error(String(error)));
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'CACHE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch cache statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/storage/daily-stats
  // Returns time-bucketed aggregated Storage statistics for time-series visualization
  // Query params: from, to, groupBy (hour|day|week|month), breakdownBy (dot-path), metrics (csv)
  const storageDailyStatsPaths = resolvePaths(basePath, '/adapters/storage/daily-stats');
  for (const path of storageDailyStatsPaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getDailyStats) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support daily statistics',
          },
        });
      }

      try {
        const dateRange = extractDateRange(request.query);
        const statsOptions = extractStatsOptions(request.query);

        const dailyStats = await analytics.getDailyStats({
          type: ['storage.read.completed', 'storage.write.completed', 'storage.delete.completed'],
          from: dateRange.from,
          to: dateRange.to,
          limit: 50000,
          ...statsOptions,
        });

        return reply.send({ ok: true, data: dailyStats });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_DATE_RANGE', message: error.message },
          });
        }
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'DAILY_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch daily statistics',
          },
        });
      }
    });
  }

  // GET /api/v1/adapters/storage/usage
  // Returns aggregated Storage usage statistics
  const storageUsagePaths = resolvePaths(basePath, '/adapters/storage/usage');
  for (const path of storageUsagePaths) {
    fastify.get(path, async (request, reply) => {
      const analytics = platform.analytics;

      if (!analytics.getEvents) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'ANALYTICS_NOT_IMPLEMENTED',
            message: 'Analytics adapter does not support reading events',
          },
        });
      }

      try {
        // Extract and validate date range
        const dateRange = extractDateRange(request.query);

        const readEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'storage.read.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );
        const writeEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'storage.write.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );
        const deleteEvents = await fetchAllEventsBatched(
          analytics,
          {
            type: 'storage.delete.completed',
            from: dateRange.from,
            to: dateRange.to,
          },
          fastify
        );

        const stats = {
          readOperations: readEvents.length,
          writeOperations: writeEvents.length,
          deleteOperations: deleteEvents.length,
          totalBytesRead: 0,
          totalBytesWritten: 0,
          avgReadDuration: 0,
          avgWriteDuration: 0,
        };

        let totalReadDuration = 0;
        for (const event of readEvents) {
          const props = getEventData(event);
          stats.totalBytesRead += Number(props.bytesRead || 0);
          totalReadDuration += Number(props.durationMs || 0);
        }
        stats.avgReadDuration = stats.readOperations > 0 ? totalReadDuration / stats.readOperations : 0;

        let totalWriteDuration = 0;
        for (const event of writeEvents) {
          const props = getEventData(event);
          stats.totalBytesWritten += Number(props.bytesWritten || 0);
          totalWriteDuration += Number(props.durationMs || 0);
        }
        stats.avgWriteDuration = stats.writeOperations > 0 ? totalWriteDuration / stats.writeOperations : 0;

        return { ok: true, data: stats, meta: { source: 'analytics-adapter' } };
      } catch (error) {
        // Handle validation errors
        if (error instanceof Error && error.message.includes('Invalid')) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'INVALID_DATE_RANGE',
              message: error.message,
            },
          });
        }

        platform.logger.error('Failed to fetch Storage usage stats', error instanceof Error ? error : new Error(String(error)));
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'STORAGE_USAGE_STATS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch storage statistics',
          },
        });
      }
    });
  }

  fastify.log.info('Platform adapter routes registered');
}
