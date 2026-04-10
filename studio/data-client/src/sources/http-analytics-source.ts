/**
 * @module @kb-labs/studio-data-client/sources/http-analytics-source
 * HTTP implementation of AnalyticsDataSource
 */

import type { HttpClient } from '../client/http-client';
import type { AnalyticsDataSource } from './analytics-source';
import type {
  EventsQuery,
  EventsResponse,
  EventsStats,
  BufferStatus,
  DlqStatus,
} from '../contracts/analytics';

/**
 * HTTP implementation of AnalyticsDataSource
 * Calls REST API /v1/analytics/* endpoints
 */
export class HttpAnalyticsSource implements AnalyticsDataSource {
  constructor(private readonly client: HttpClient) {}

  async getEvents(query?: EventsQuery): Promise<EventsResponse> {
    const params = new URLSearchParams();

    if (query?.type) {
      if (Array.isArray(query.type)) {
        query.type.forEach(t => params.append('type', t));
      } else {
        params.set('type', query.type);
      }
    }
    if (query?.source) {params.set('source', query.source);}
    if (query?.actor) {params.set('actor', query.actor);}
    if (query?.from) {params.set('from', query.from);}
    if (query?.to) {params.set('to', query.to);}
    if (query?.limit) {params.set('limit', String(query.limit));}
    if (query?.offset) {params.set('offset', String(query.offset));}

    const path = `/analytics/events${params.toString() ? `?${params}` : ''}`;
    return this.client.fetch<EventsResponse>(path);
  }

  async getStats(): Promise<EventsStats> {
    return this.client.fetch<EventsStats>('/analytics/stats');
  }

  async getBufferStatus(): Promise<BufferStatus | null> {
    try {
      return this.client.fetch<BufferStatus>('/analytics/buffer/status');
    } catch (_error) {
      // Analytics not configured or buffer not applicable (501)
      return null;
    }
  }

  async getDlqStatus(): Promise<DlqStatus | null> {
    try {
      return this.client.fetch<DlqStatus>('/analytics/dlq/status');
    } catch (_error) {
      // Analytics not configured or DLQ not applicable (501)
      return null;
    }
  }
}
