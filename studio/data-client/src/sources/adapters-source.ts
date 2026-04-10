/**
 * @module @kb-labs/studio-data-client/sources/adapters-source
 * Platform adapter analytics data source interface
 */

import type {
  LLMUsageStats,
  EmbeddingsUsageStats,
  VectorStoreUsageStats,
  CacheUsageStats,
  StorageUsageStats,
} from '../contracts/adapters';

/**
 * Date range and aggregation options for analytics queries
 */
export interface DateRangeOptions {
  /** Start date (ISO 8601 timestamp) */
  from?: string;

  /** End date (ISO 8601 timestamp) */
  to?: string;

  /**
   * Optional model filter (LLM analytics only, legacy).
   * Prefer breakdownBy='payload.model' for universal breakdown support.
   */
  models?: string | string[];

  /**
   * Time bucket granularity. Default: 'day'.
   * Controls the format of DailyStats.date in the response.
   */
  groupBy?: 'hour' | 'day' | 'week' | 'month';

  /**
   * Dot-notation path to split results by (e.g. 'payload.model', 'payload.tier').
   * When specified, each time bucket returns multiple rows — one per unique value.
   * Rows include a `breakdown` field with the field value.
   * Adapters that don't support this silently return data without breakdown.
   */
  breakdownBy?: string;

  /**
   * Specific metric field names to aggregate (e.g. ['totalCost', 'totalTokens']).
   * When omitted, adapters return all known metrics for the event type.
   */
  metrics?: string[];
}

/**
 * Daily aggregated statistics for time-series charts
 */
export interface DailyStats {
  /**
   * Bucket key — format depends on groupBy:
   * 'YYYY-MM-DD' (day, default), 'YYYY-MM-DDTHH' (hour), 'YYYY-WXX' (week), 'YYYY-MM' (month)
   */
  date: string;

  /** Number of events in this bucket */
  count: number;

  /** Event-specific metrics (e.g., totalTokens, totalCost, avgDurationMs) */
  metrics?: Record<string, number>;

  /**
   * Present when DateRangeOptions.breakdownBy is specified.
   * The value of the breakdown field for this row.
   */
  breakdown?: string;
}

/**
 * Platform adapter analytics data source
 */
export interface AdaptersDataSource {
  /**
   * Get LLM usage statistics
   * @param options - Optional date range filter
   */
  getLLMUsage(options?: DateRangeOptions): Promise<LLMUsageStats>;

  /**
   * Get Embeddings usage statistics
   * @param options - Optional date range filter
   */
  getEmbeddingsUsage(options?: DateRangeOptions): Promise<EmbeddingsUsageStats>;

  /**
   * Get VectorStore usage statistics
   * @param options - Optional date range filter
   */
  getVectorStoreUsage(options?: DateRangeOptions): Promise<VectorStoreUsageStats>;

  /**
   * Get Cache usage statistics
   * @param options - Optional date range filter
   */
  getCacheUsage(options?: DateRangeOptions): Promise<CacheUsageStats>;

  /**
   * Get Storage usage statistics
   * @param options - Optional date range filter
   */
  getStorageUsage(options?: DateRangeOptions): Promise<StorageUsageStats>;

  /**
   * Get daily aggregated LLM statistics for time-series charts
   * @param options - Optional date range filter
   */
  getLLMDailyStats(options?: DateRangeOptions): Promise<DailyStats[]>;

  /**
   * Get daily aggregated Embeddings statistics for time-series charts
   * @param options - Optional date range filter
   */
  getEmbeddingsDailyStats(options?: DateRangeOptions): Promise<DailyStats[]>;

  /**
   * Get daily aggregated VectorStore statistics for time-series charts
   * @param options - Optional date range filter
   */
  getVectorStoreDailyStats(options?: DateRangeOptions): Promise<DailyStats[]>;

  /**
   * Get daily aggregated Cache statistics for time-series charts
   * @param options - Optional date range filter
   */
  getCacheDailyStats(options?: DateRangeOptions): Promise<DailyStats[]>;

  /**
   * Get daily aggregated Storage statistics for time-series charts
   * @param options - Optional date range filter
   */
  getStorageDailyStats(options?: DateRangeOptions): Promise<DailyStats[]>;
}
