/**
 * @module @kb-labs/core-platform/noop/adapters/log-reader
 *
 * NoOp `ILogReader` — read operations return empty results.
 *
 * This is the default fallback when no log-reader is configured. We chose
 * empty-returns over throwing because a missing log backend is benign:
 * "no logs to show" is a valid answer. Real adapters override this with
 * persistence + ring-buffer backends.
 */

import type {
  ILogReader,
  LogCapabilities,
  LogQueryOptions,
  LogQueryResult,
  LogSearchOptions,
  LogSearchResult,
  LogStats,
} from '../../adapters/log-reader.js';
import type { LogQuery, LogRecord } from '../../adapters/logger.js';

export class NoOpLogReader implements ILogReader {
  async query(_filters: LogQuery, _options?: LogQueryOptions): Promise<LogQueryResult> {
    return { logs: [], total: 0, hasMore: false, source: 'buffer' };
  }

  async getById(_id: string): Promise<LogRecord | null> {
    return null;
  }

  async search(_searchText: string, _options?: LogSearchOptions): Promise<LogSearchResult> {
    return { logs: [], total: 0, hasMore: false };
  }

  subscribe(_callback: (log: LogRecord) => void, _filters?: LogQuery): () => void {
    return () => { /* noop */ };
  }

  async getStats(): Promise<LogStats> {
    return {};
  }

  getCapabilities(): LogCapabilities {
    return {
      hasBuffer: false,
      hasPersistence: false,
      hasStreaming: false,
      hasSearch: false,
    };
  }
}
