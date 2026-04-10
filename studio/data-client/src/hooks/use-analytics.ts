/**
 * @module @kb-labs/studio-data-client/hooks/use-analytics
 * React Query hooks for analytics data
 */

import { useQuery } from '@tanstack/react-query';
import type { AnalyticsDataSource } from '../sources/analytics-source';
import type { EventsQuery } from '../contracts/analytics';

/**
 * Hook to fetch analytics events
 *
 * @param source - Analytics data source
 * @param query - Optional query filters
 */
export function useAnalyticsEvents(source: AnalyticsDataSource, query?: EventsQuery) {
  return useQuery({
    queryKey: ['analytics', 'events', query],
    queryFn: () => source.getEvents(query),
    refetchInterval: 30000, // Auto-refresh every 30s
    staleTime: 25000, // Consider data stale after 25s
    retry: 2,
  });
}

/**
 * Hook to fetch analytics stats
 *
 * @param source - Analytics data source
 */
export function useAnalyticsStats(source: AnalyticsDataSource) {
  return useQuery({
    queryKey: ['analytics', 'stats'],
    queryFn: () => source.getStats(),
    refetchInterval: 30000, // Auto-refresh every 30s
    staleTime: 25000,
    retry: 2,
  });
}

/**
 * Hook to fetch buffer status
 *
 * @param source - Analytics data source
 */
export function useAnalyticsBufferStatus(source: AnalyticsDataSource) {
  return useQuery({
    queryKey: ['analytics', 'buffer'],
    queryFn: () => source.getBufferStatus(),
    refetchInterval: 10000, // Auto-refresh every 10s
    staleTime: 8000,
    retry: 2,
  });
}

/**
 * Hook to fetch DLQ status
 *
 * @param source - Analytics data source
 */
export function useAnalyticsDlqStatus(source: AnalyticsDataSource) {
  return useQuery({
    queryKey: ['analytics', 'dlq'],
    queryFn: () => source.getDlqStatus(),
    refetchInterval: 15000, // Auto-refresh every 15s
    staleTime: 12000,
    retry: 2,
  });
}
