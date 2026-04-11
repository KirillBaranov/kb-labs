/**
 * @module @kb-labs/rest-api-app/services/incident-storage
 * Incident history storage service (SQLite-backed)
 */

import type { ISQLDatabase } from '@kb-labs/core-platform/adapters';
import { platform } from '@kb-labs/core-runtime';

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'critical' | 'warning' | 'info';

/**
 * Incident type categories
 */
export type IncidentType =
  | 'error_rate'
  | 'latency_spike'
  | 'plugin_failure'
  | 'adapter_failure'
  | 'system_health'
  | 'custom';

/**
 * Root cause analysis item
 */
export interface RootCauseItem {
  /** Factor contributing to the incident */
  factor: string;
  /** Confidence level (0.0 - 1.0) */
  confidence: number;
  /** Evidence supporting this root cause */
  evidence: string;
}

/**
 * Related logs context
 */
export interface RelatedLogsData {
  /** Number of error logs in timeframe */
  errorCount: number;
  /** Number of warning logs in timeframe */
  warnCount: number;
  /** Time range [from, to] in Unix ms */
  timeRange: [number, number];
  /** Sample error messages (top 5) */
  sampleErrors: string[];
  /** Top endpoints with errors (NEW) */
  topEndpoints?: Array<{
    endpoint: string;
    count: number;
    sample: string;
  }>;
}

/**
 * Slow request details (NEW)
 */
export interface SlowRequest {
  /** Request endpoint */
  endpoint: string;
  /** HTTP method */
  method: string;
  /** Request duration in milliseconds */
  durationMs: number;
  /** HTTP status code */
  statusCode?: number;
}

/**
 * Related metrics context
 */
export interface RelatedMetricsData {
  /** Metrics before incident */
  before?: Record<string, number>;
  /** Metrics during incident */
  during?: Record<string, number>;
  /** Top slowest requests (NEW - for latency incidents) */
  topSlowest?: SlowRequest[];
  /** Affected endpoints (NEW - which endpoints were slow) */
  affectedEndpoints?: string[];
}

/**
 * Timeline event
 */
export interface TimelineEvent {
  /** Event timestamp (Unix ms) */
  timestamp: number;
  /** Event description */
  event: string;
  /** Source of event */
  source: 'detector' | 'logs' | 'metrics' | 'manual';
}

/**
 * Related data gathered during incident
 */
export interface RelatedData {
  /** Related logs information */
  logs?: RelatedLogsData;
  /** Related metrics information */
  metrics?: RelatedMetricsData;
  /** Timeline of events */
  timeline?: TimelineEvent[];
}

/**
 * Incident record structure
 */
export interface Incident {
  /** Unique incident identifier */
  id: string;
  /** Incident type */
  type: IncidentType;
  /** Severity level */
  severity: IncidentSeverity;
  /** Incident title/summary */
  title: string;
  /** Detailed description */
  details: string;
  /** Root cause analysis (optional) - array of contributing factors */
  rootCause?: RootCauseItem[];
  /** Affected services/plugins */
  affectedServices?: string[];
  /** Timestamp when incident occurred (Unix ms) */
  timestamp: number;
  /** Timestamp when incident was resolved (Unix ms) */
  resolvedAt?: number;
  /** Resolution notes */
  resolutionNotes?: string;
  /** Related metrics/logs (legacy field from detector) */
  metadata?: Record<string, unknown>;
  /** NEW: Related data (logs, metrics, timeline) */
  relatedData?: RelatedData;
  /** NEW: AI analysis results (set after analysis) */
  aiAnalysis?: any; // Will be typed in analyzer module
  /** NEW: When AI analysis was performed */
  aiAnalyzedAt?: number;
}

/**
 * Incident create payload (omit id, timestamp is optional - will be set to now if not provided)
 */
export type IncidentCreatePayload = Omit<Incident, 'id' | 'timestamp'> & {
  timestamp?: number;
};

/**
 * Incident query options
 */
export interface IncidentQueryOptions {
  /** Maximum number of incidents to return (default: 50) */
  limit?: number;
  /** Filter by severity */
  severity?: IncidentSeverity | IncidentSeverity[];
  /** Filter by type */
  type?: IncidentType | IncidentType[];
  /** Filter by time range (from timestamp) */
  from?: number;
  /** Filter by time range (to timestamp) */
  to?: number;
  /** Include resolved incidents (default: false) */
  includeResolved?: boolean;
}

/**
 * Incident storage service configuration
 */
export interface IncidentStorageConfig {
  /** TTL for incidents in milliseconds (default: 30 days) */
  ttlMs?: number;
  /** Maximum incidents to store (default: 1000) */
  maxIncidents?: number;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<IncidentStorageConfig> = {
  ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days (not used with SQLite, kept for compatibility)
  maxIncidents: 1000, // Not enforced with SQLite, use retention policy instead
  debug: false,
};

/**
 * Database row structure (matches SQL schema)
 */
interface IncidentRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  details: string;
  timestamp: number;
  resolved_at: number | null;
  created_at: number;
  resolution_notes: string | null;
  affected_services: string | null; // JSON
  metadata: string | null; // JSON
  related_logs_count: number;
  related_logs_sample: string | null; // JSON
  related_metrics: string | null; // JSON
  timeline: string | null; // JSON
  ai_analysis: string | null; // JSON
  ai_analyzed_at: number | null;
}

/**
 * Incident storage service
 *
 * Stores incident history in SQLite database for persistence.
 * Provides CRUD operations, query filtering, and full-text search.
 */
export class IncidentStorage {
  private db: ISQLDatabase;
  private config: Required<IncidentStorageConfig>;
  private logger: Console | any;

  constructor(db: ISQLDatabase, config: IncidentStorageConfig = {}, logger: Console | any = console) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Create a new incident record
   */
  async createIncident(payload: IncidentCreatePayload): Promise<Incident> {
    // Generate unique ID
    const id = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = payload.timestamp ?? Date.now();

    // Validate required fields
    if (!payload.type || !payload.severity || !payload.title) {
      throw new Error('Incident must have type, severity, and title');
    }

    // Extract related data for denormalized storage
    const relatedLogsCount = payload.relatedData?.logs?.errorCount ?? 0;
    // Store entire logs structure (includes sampleErrors, topEndpoints, etc.)
    const relatedLogsSample = payload.relatedData?.logs
      ? JSON.stringify(payload.relatedData.logs)
      : null;
    const relatedMetrics = payload.relatedData?.metrics
      ? JSON.stringify(payload.relatedData.metrics)
      : null;
    const timeline = payload.relatedData?.timeline
      ? JSON.stringify(payload.relatedData.timeline)
      : null;

    // Insert into database
    await this.db.query(
      `INSERT INTO incidents (
        id, type, severity, title, details, timestamp,
        resolved_at, resolution_notes,
        affected_services, metadata,
        related_logs_count, related_logs_sample, related_metrics, timeline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        payload.type,
        payload.severity,
        payload.title,
        payload.details,
        timestamp,
        payload.resolvedAt ?? null,
        payload.resolutionNotes ?? null,
        payload.affectedServices ? JSON.stringify(payload.affectedServices) : null,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
        relatedLogsCount,
        relatedLogsSample,
        relatedMetrics,
        timeline,
      ]
    );

    this.log('info', 'Incident created', {
      id,
      type: payload.type,
      severity: payload.severity,
    });

    // Fetch and return the created incident
    const created = await this.getIncident(id);
    if (!created) {
      throw new Error('Failed to retrieve created incident');
    }

    return created;
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    const result = await this.db.query<IncidentRow>(
      'SELECT * FROM incidents WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToIncident(result.rows[0]!);
  }

  /**
   * Query incidents with filters
   */
  async queryIncidents(options: IncidentQueryOptions = {}): Promise<Incident[]> {
    const {
      limit = 50,
      severity,
      type,
      from,
      to,
      includeResolved = false,
    } = options;

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Filter by severity
    if (severity) {
      const severityList = Array.isArray(severity) ? severity : [severity];
      conditions.push(`severity IN (${severityList.map(() => '?').join(', ')})`);
      params.push(...severityList);
    }

    // Filter by type
    if (type) {
      const typeList = Array.isArray(type) ? type : [type];
      conditions.push(`type IN (${typeList.map(() => '?').join(', ')})`);
      params.push(...typeList);
    }

    // Filter by time range
    if (from) {
      conditions.push('timestamp >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('timestamp <= ?');
      params.push(to);
    }

    // Filter resolved incidents
    if (!includeResolved) {
      conditions.push('resolved_at IS NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT * FROM incidents
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const result = await this.db.query<IncidentRow>(sql, [...params, limit]);

    return result.rows.map(row => this.rowToIncident(row));
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(id: string, resolutionNotes?: string): Promise<Incident | null> {
    const resolvedAt = Date.now();

    const result = await this.db.query(
      `UPDATE incidents
       SET resolved_at = ?, resolution_notes = ?
       WHERE id = ?`,
      [resolvedAt, resolutionNotes ?? null, id]
    );

    if (result.rowCount === 0) {
      return null; // Not found
    }

    this.log('info', 'Incident resolved', { id, resolvedAt });

    const incident = await this.getIncident(id);

    // Track analytics event
    if (incident && platform.analytics) {
      const durationMs = resolvedAt - incident.timestamp;
      const durationMinutes = Math.floor(durationMs / 60000);

      platform.analytics.track('incident.resolved', {
        incidentId: id,
        type: incident.type,
        severity: incident.severity,
        durationMs,
        durationMinutes,
        hasResolutionNotes: !!resolutionNotes,
        wasAnalyzed: !!incident.aiAnalysis,
      }).catch(() => {
        // Silently ignore analytics errors
      });
    }

    return incident;
  }

  /**
   * Delete an incident
   */
  async deleteIncident(id: string): Promise<boolean> {
    // Get incident before deleting for analytics
    const incident = await this.getIncident(id);

    const result = await this.db.query('DELETE FROM incidents WHERE id = ?', [id]);

    const deleted = result.rowCount > 0;

    if (deleted) {
      this.log('info', 'Incident deleted', { id });

      // Track analytics event
      if (incident && platform.analytics) {
        platform.analytics.track('incident.deleted', {
          incidentId: id,
          type: incident.type,
          severity: incident.severity,
          wasResolved: !!incident.resolvedAt,
          wasAnalyzed: !!incident.aiAnalysis,
        }).catch(() => {
          // Silently ignore analytics errors
        });
      }
    }

    return deleted;
  }

  /**
   * Get statistics about stored incidents
   */
  async getStats(): Promise<{
    total: number;
    bySeverity: Record<IncidentSeverity, number>;
    byType: Record<string, number>;
    resolved: number;
    unresolved: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    // Get total and timestamp range
    const totalResult = await this.db.query<{
      total: number;
      oldest: number | null;
      newest: number | null;
    }>(`
      SELECT
        COUNT(*) as total,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest
      FROM incidents
    `);

    const { total, oldest, newest } = totalResult.rows[0]!;

    // Get counts by severity
    const severityResult = await this.db.query<{
      severity: IncidentSeverity;
      count: number;
    }>('SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity');

    const bySeverity: Record<IncidentSeverity, number> = {
      critical: 0,
      warning: 0,
      info: 0,
    };
    for (const row of severityResult.rows) {
      bySeverity[row.severity] = row.count;
    }

    // Get counts by type
    const typeResult = await this.db.query<{
      type: string;
      count: number;
    }>('SELECT type, COUNT(*) as count FROM incidents GROUP BY type');

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.type] = row.count;
    }

    // Get resolved/unresolved counts
    const resolvedResult = await this.db.query<{
      resolved: number;
      unresolved: number;
    }>(`
      SELECT
        SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) as unresolved
      FROM incidents
    `);

    const { resolved, unresolved } = resolvedResult.rows[0]!;

    return {
      total,
      bySeverity,
      byType,
      resolved: resolved ?? 0,
      unresolved: unresolved ?? 0,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    };
  }

  /**
   * Clear all incidents (admin function)
   */
  async clearAll(): Promise<void> {
    await this.db.query('DELETE FROM incidents');
    this.log('warn', 'All incidents cleared');
  }

  /**
   * Update AI analysis for an incident
   */
  async updateAIAnalysis(id: string, analysis: any): Promise<void> {
    await this.db.query(
      `UPDATE incidents
       SET ai_analysis = ?, ai_analyzed_at = ?
       WHERE id = ?`,
      [JSON.stringify(analysis), Date.now(), id]
    );

    this.log('debug', 'AI analysis updated', { id });
  }

  /**
   * Convert database row to Incident object
   * @private
   */
  private rowToIncident(row: IncidentRow): Incident {
    // Parse JSON fields
    const affectedServices = row.affected_services
      ? (JSON.parse(row.affected_services) as string[])
      : undefined;
    const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined;
    const aiAnalysis = row.ai_analysis ? JSON.parse(row.ai_analysis) : undefined;

    // Reconstruct related data
    const relatedData: RelatedData | undefined =
      row.related_logs_sample || row.related_metrics || row.timeline
        ? {
            logs: row.related_logs_sample
              ? (JSON.parse(row.related_logs_sample) as RelatedLogsData)
              : undefined,
            metrics: row.related_metrics
              ? (JSON.parse(row.related_metrics) as RelatedMetricsData)
              : undefined,
            timeline: row.timeline ? (JSON.parse(row.timeline) as TimelineEvent[]) : undefined,
          }
        : undefined;

    return {
      id: row.id,
      type: row.type as IncidentType,
      severity: row.severity as IncidentSeverity,
      title: row.title,
      details: row.details,
      timestamp: row.timestamp,
      resolvedAt: row.resolved_at ?? undefined,
      resolutionNotes: row.resolution_notes ?? undefined,
      affectedServices,
      metadata,
      relatedData,
      aiAnalysis,
      aiAnalyzedAt: row.ai_analyzed_at ?? undefined,
    };
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any): void {
    if (level === 'debug' && !this.config.debug) {return;}

    if (this.logger[level]) {
      this.logger[level](`[IncidentStorage] ${message}`, meta);
    } else {
      console.log(`[IncidentStorage] [${level}] ${message}`, meta);
    }
  }
}
