/**
 * @module @kb-labs/studio-data-client/sources/analytics-source
 * Analytics data source interface
 */

import type {
  EventsQuery,
  EventsResponse,
  EventsStats,
  BufferStatus,
  DlqStatus,
} from '../contracts/analytics';

/**
 * Analytics data source interface
 */
export interface AnalyticsDataSource {
  /**
   * Get analytics events
   */
  getEvents(query?: EventsQuery): Promise<EventsResponse>;

  /**
   * Get aggregated statistics
   */
  getStats(): Promise<EventsStats>;

  /**
   * Get buffer status (if applicable)
   */
  getBufferStatus(): Promise<BufferStatus | null>;

  /**
   * Get DLQ status (if applicable)
   */
  getDlqStatus(): Promise<DlqStatus | null>;
}
