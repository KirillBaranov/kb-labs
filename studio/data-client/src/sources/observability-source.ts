import type {
  StateBrokerStats,
  DevKitHealth,
  PrometheusMetrics,
  SystemEvent,
  LogRecord,
  LogQuery,
  LogQueryResponse,
  LogSummarizeRequest,
  LogSummarizeResponse,
  HistoricalDataPoint,
  HeatmapCell,
  MetricsHistoryQuery,
  MetricsHeatmapQuery,
  Incident,
  IncidentQuery,
  IncidentCreatePayload,
  IncidentsListResponse,
  IncidentDetailResponse,
  IncidentAnalysisResponse,
} from '../contracts/observability';

/**
 * Observability data source interface
 */
export interface ObservabilityDataSource {
  /**
   * Get State Broker statistics
   */
  getStateBrokerStats(): Promise<StateBrokerStats>;

  /**
   * Get DevKit health snapshot
   */
  getDevKitHealth(): Promise<DevKitHealth>;

  /**
   * Get Prometheus metrics from REST API
   */
  getPrometheusMetrics(): Promise<PrometheusMetrics>;

  /**
   * Subscribe to system events SSE stream
   * Returns cleanup function
   */
  subscribeToSystemEvents(onEvent: (event: SystemEvent) => void, onError: (error: Error) => void): () => void;

  /**
   * Query logs with filters
   */
  queryLogs(filters: LogQuery): Promise<LogQueryResponse>;

  /**
   * Subscribe to live log stream
   * Returns cleanup function
   */
  subscribeToLogs(onLog: (log: LogRecord) => void, onError: (error: Error) => void, filters?: LogQuery): () => void;

  /**
   * Get AI-powered log summarization
   */
  summarizeLogs(request: LogSummarizeRequest): Promise<LogSummarizeResponse>;

  /**
   * Get single log by ID with optional related logs
   */
  getLog(id: string, includeRelated?: boolean): Promise<{ log: LogRecord; related?: LogRecord[] }>;

  /**
   * Get logs related to a specific log (same trace/execution/request)
   */
  getRelatedLogs(id: string): Promise<{ total: number; logs: LogRecord[]; correlationKeys: any }>;

  /**
   * Get historical metrics time-series data
   */
  getMetricsHistory(query: MetricsHistoryQuery): Promise<HistoricalDataPoint[]>;

  /**
   * Get metrics heatmap data (7 days × 24 hours)
   */
  getMetricsHeatmap(query: MetricsHeatmapQuery): Promise<HeatmapCell[]>;

  /**
   * Query incident history (DEPRECATED - use listIncidents)
   */
  queryIncidents(query?: IncidentQuery): Promise<Incident[]>;

  /**
   * Create a new incident
   */
  createIncident(payload: IncidentCreatePayload): Promise<Incident>;

  /**
   * Resolve an incident
   */
  resolveIncident(id: string, resolutionNotes?: string): Promise<Incident>;

  /**
   * List incidents with filters and summary stats (NEW)
   */
  listIncidents(query?: IncidentQuery): Promise<IncidentsListResponse>;

  /**
   * Get incident details by ID (NEW)
   */
  getIncident(id: string): Promise<IncidentDetailResponse>;

  /**
   * Analyze incident with AI (NEW)
   */
  analyzeIncident(id: string): Promise<IncidentAnalysisResponse>;

  /**
   * Chat with AI insights
   */
  chatWithInsights(
    question: string,
    context?: {
      includeMetrics?: boolean;
      includeIncidents?: boolean;
      includeHistory?: boolean;
      timeRange?: '1h' | '6h' | '24h' | '7d';
      plugins?: string[];
    }
  ): Promise<{
    answer: string;
    context: string[];
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}
