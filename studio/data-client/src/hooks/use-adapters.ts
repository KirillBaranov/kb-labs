/**
 * @module @kb-labs/studio-data-client/hooks/use-adapters
 * React Query hooks for platform adapter analytics
 */

import { useQuery } from '@tanstack/react-query';
import type { AdaptersDataSource, DateRangeOptions } from '../sources/adapters-source';

const DAILY_STATS = 'daily-stats';

/**
 * Hook to fetch LLM usage statistics
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersLLMUsage(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'llm', 'usage', options?.from, options?.to],
    queryFn: () => source.getLLMUsage(options),
    refetchInterval: 60000, // Auto-refresh every 60s (LLM stats change slower)
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch Embeddings usage statistics
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersEmbeddingsUsage(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'embeddings', 'usage', options?.from, options?.to],
    queryFn: () => source.getEmbeddingsUsage(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch VectorStore usage statistics
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersVectorStoreUsage(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'vectorstore', 'usage', options?.from, options?.to],
    queryFn: () => source.getVectorStoreUsage(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch Cache usage statistics
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersCacheUsage(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'cache', 'usage', options?.from, options?.to],
    queryFn: () => source.getCacheUsage(options),
    refetchInterval: 30000, // Cache stats change faster - refresh every 30s
    staleTime: 25000,
    retry: 2,
  });
}

/**
 * Hook to fetch Storage usage statistics
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersStorageUsage(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'storage', 'usage', options?.from, options?.to],
    queryFn: () => source.getStorageUsage(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch LLM daily statistics for time-series charts
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersLLMDailyStats(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'llm', DAILY_STATS, options?.from, options?.to, options?.models],
    queryFn: () => source.getLLMDailyStats(options),
    refetchInterval: 60000, // Daily stats change slower
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch Embeddings daily statistics for time-series charts
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersEmbeddingsDailyStats(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'embeddings', DAILY_STATS, options?.from, options?.to],
    queryFn: () => source.getEmbeddingsDailyStats(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch VectorStore daily statistics for time-series charts
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersVectorStoreDailyStats(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'vectorstore', DAILY_STATS, options?.from, options?.to],
    queryFn: () => source.getVectorStoreDailyStats(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}

/**
 * Hook to fetch Cache daily statistics for time-series charts
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersCacheDailyStats(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'cache', DAILY_STATS, options?.from, options?.to],
    queryFn: () => source.getCacheDailyStats(options),
    refetchInterval: 30000, // Cache stats change faster
    staleTime: 25000,
    retry: 2,
  });
}

/**
 * Hook to fetch Storage daily statistics for time-series charts
 *
 * @param source - Adapters data source
 * @param options - Optional date range filter
 */
export function useAdaptersStorageDailyStats(source: AdaptersDataSource, options?: DateRangeOptions) {
  return useQuery({
    queryKey: ['adapters', 'storage', DAILY_STATS, options?.from, options?.to],
    queryFn: () => source.getStorageDailyStats(options),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 2,
  });
}
