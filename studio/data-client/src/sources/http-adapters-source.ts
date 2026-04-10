/**
 * @module @kb-labs/studio-data-client/sources/http-adapters-source
 * HTTP implementation of AdaptersDataSource
 */

import type { HttpClient } from '../client/http-client';
import type { AdaptersDataSource, DateRangeOptions, DailyStats } from './adapters-source';
import type {
  LLMUsageStats,
  EmbeddingsUsageStats,
  VectorStoreUsageStats,
  CacheUsageStats,
  StorageUsageStats,
} from '../contracts/adapters';

/**
 * HTTP implementation of AdaptersDataSource
 * Calls REST API /v1/adapters/* endpoints
 */
export class HttpAdaptersSource implements AdaptersDataSource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Build query string from date range options
   */
  private buildQueryString(options?: DateRangeOptions): string {
    const params = new URLSearchParams();

    if (options?.from) {params.append('from', options.from);}
    if (options?.to) {params.append('to', options.to);}

    // Legacy model filter
    if (options?.models) {
      const modelsArray = Array.isArray(options.models) ? options.models : [options.models];
      if (modelsArray.length > 0) {params.append('models', modelsArray.join(','));}
    }

    // StatsQuery fields
    if (options?.groupBy) {params.append('groupBy', options.groupBy);}
    if (options?.breakdownBy) {params.append('breakdownBy', options.breakdownBy);}
    if (options?.metrics && options.metrics.length > 0) {params.append('metrics', options.metrics.join(','));}

    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  async getLLMUsage(options?: DateRangeOptions): Promise<LLMUsageStats> {
    const query = this.buildQueryString(options);
    return this.client.fetch<LLMUsageStats>(`/adapters/llm/usage${query}`);
  }

  async getEmbeddingsUsage(options?: DateRangeOptions): Promise<EmbeddingsUsageStats> {
    const query = this.buildQueryString(options);
    return this.client.fetch<EmbeddingsUsageStats>(`/adapters/embeddings/usage${query}`);
  }

  async getVectorStoreUsage(options?: DateRangeOptions): Promise<VectorStoreUsageStats> {
    const query = this.buildQueryString(options);
    return this.client.fetch<VectorStoreUsageStats>(`/adapters/vectorstore/usage${query}`);
  }

  async getCacheUsage(options?: DateRangeOptions): Promise<CacheUsageStats> {
    const query = this.buildQueryString(options);
    return this.client.fetch<CacheUsageStats>(`/adapters/cache/usage${query}`);
  }

  async getStorageUsage(options?: DateRangeOptions): Promise<StorageUsageStats> {
    const query = this.buildQueryString(options);
    return this.client.fetch<StorageUsageStats>(`/adapters/storage/usage${query}`);
  }

  async getLLMDailyStats(options?: DateRangeOptions): Promise<DailyStats[]> {
    const query = this.buildQueryString(options);
    return this.client.fetch<DailyStats[]>(`/adapters/llm/daily-stats${query}`);
  }

  async getEmbeddingsDailyStats(options?: DateRangeOptions): Promise<DailyStats[]> {
    const query = this.buildQueryString(options);
    return this.client.fetch<DailyStats[]>(`/adapters/embeddings/daily-stats${query}`);
  }

  async getVectorStoreDailyStats(options?: DateRangeOptions): Promise<DailyStats[]> {
    const query = this.buildQueryString(options);
    return this.client.fetch<DailyStats[]>(`/adapters/vectorstore/daily-stats${query}`);
  }

  async getCacheDailyStats(options?: DateRangeOptions): Promise<DailyStats[]> {
    const query = this.buildQueryString(options);
    return this.client.fetch<DailyStats[]>(`/adapters/cache/daily-stats${query}`);
  }

  async getStorageDailyStats(options?: DateRangeOptions): Promise<DailyStats[]> {
    const query = this.buildQueryString(options);
    return this.client.fetch<DailyStats[]>(`/adapters/storage/daily-stats${query}`);
  }
}
