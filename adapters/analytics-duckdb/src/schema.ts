/**
 * @module @kb-labs/adapters-analytics-duckdb/schema
 * DuckDB schema DDL and helpers for analytics events (kb.v1)
 */

/**
 * DDL to create the events table.
 * Maps kb.v1 event schema to flat columns for efficient SQL queries.
 * JSON columns (ctx, payload) allow json_extract_string() on arbitrary fields.
 */
export const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS events (
  id          VARCHAR PRIMARY KEY,
  schema      VARCHAR NOT NULL DEFAULT 'kb.v1',
  type        VARCHAR NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  ingest_ts   TIMESTAMPTZ,
  run_id      VARCHAR,
  product     VARCHAR,
  version     VARCHAR,
  actor_type  VARCHAR,
  actor_id    VARCHAR,
  actor_name  VARCHAR,
  ctx         JSON,
  payload     JSON
)
`;

/**
 * Indexes for fast range and filter queries.
 */
export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts)`,
  `CREATE INDEX IF NOT EXISTS events_type_idx ON events (type)`,
  `CREATE INDEX IF NOT EXISTS events_product_idx ON events (product)`,
  `CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, ts)`,
];

/**
 * Map groupBy granularity to DuckDB date_trunc unit.
 */
export const GROUP_BY_TRUNC: Record<string, string> = {
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
};

/**
 * Default date format per groupBy granularity (used for strftime in DuckDB).
 * DuckDB strftime format strings.
 */
export const GROUP_BY_FORMAT: Record<string, string> = {
  hour: '%Y-%m-%dT%H',
  day: '%Y-%m-%d',
  week: '%Y-W%W',
  month: '%Y-%m',
};

const DIRECT_COLUMNS: Record<string, string> = {
  product: 'product',
  version: 'version',
  type: 'type',
  run_id: 'run_id',
  runId: 'run_id',
};

const ACTOR_COLUMNS: Record<string, string> = {
  type: 'actor_type',
  id: 'actor_id',
  name: 'actor_name',
};

const SOURCE_COLUMNS: Record<string, string> = {
  product: 'product',
  version: 'version',
};

/**
 * Convert dot-notation path (e.g. 'payload.model') to DuckDB JSON path expression.
 * 'payload.model' → json_extract_string(payload, '$.model')
 * 'source.product' → handled as direct column (product)
 * 'actor.type' → handled as direct column (actor_type)
 *
 * For nested paths inside json columns (ctx, payload), use json_extract_string.
 */
export function dotPathToSQL(path: string): string {
  const parts = path.split('.');
  const root = parts[0];
  const child = parts[1];

  if (root) {
    const direct = DIRECT_COLUMNS[root];
    if (direct) {
      return direct;
    }
  }

  if (root === 'actor' && child) {
    const mapped = ACTOR_COLUMNS[child];
    if (mapped) {
      return mapped;
    }
  }

  if (root === 'source' && child) {
    const mapped = SOURCE_COLUMNS[child];
    if (mapped) {
      return mapped;
    }
  }

  // JSON column paths
  if (root === 'payload' || root === 'ctx') {
    const jsonPath = '$.' + parts.slice(1).join('.');
    return `json_extract_string(${root}, '${jsonPath}')`;
  }

  // Fallback: treat as payload field
  const jsonPath = '$.' + parts.join('.');
  return `json_extract_string(payload, '${jsonPath}')`;
}

/**
 * Known numeric metrics per event type prefix.
 * Used to build default SELECT list when metrics filter is not specified.
 */
export const DEFAULT_METRICS: Record<string, string[]> = {
  'llm.': ['totalTokens', 'totalCost', 'durationMs', 'inputTokens', 'outputTokens'],
  'embeddings.': ['totalTokens', 'totalCost', 'durationMs'],
  'vectorstore.': ['durationMs'],
  'cache.': ['durationMs'],
  'storage.': ['bytesRead', 'bytesWritten', 'durationMs'],
};

/**
 * Get default metrics for an event type filter.
 */
export function getDefaultMetrics(typeFilter?: string | string[]): string[] {
  if (!typeFilter) {return ['totalCost', 'totalTokens', 'durationMs'];}

  const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
  for (const [prefix, metrics] of Object.entries(DEFAULT_METRICS)) {
    if (types.some((t) => t.startsWith(prefix))) {
      return metrics;
    }
  }
  return ['totalCost', 'totalTokens', 'durationMs'];
}

/**
 * Build the metrics SELECT clause fragments.
 * Returns array of SQL expressions like:
 *   "SUM(TRY_CAST(json_extract_string(payload, '$.totalTokens') AS DOUBLE)) as totalTokens"
 */
export function buildMetricsSelect(metricNames: string[]): string[] {
  return metricNames.map(
    (m) =>
      `SUM(TRY_CAST(json_extract_string(payload, '$.${m}') AS DOUBLE)) as "${m}"`
  );
}
