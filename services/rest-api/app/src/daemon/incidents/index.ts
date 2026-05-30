/**
 * @module @kb-labs/rest-api-app/daemon/incidents
 * Incident lifecycle: detection, SQLite storage, and post-mortem analysis.
 */
export { IncidentStorage } from './incident-storage';
export type { Incident, IncidentSeverity, IncidentType, IncidentCreatePayload, IncidentQueryOptions } from './incident-storage';
export { IncidentDetector } from './incident-detector';
export type { DetectionThresholds, IncidentDetectorConfig } from './incident-detector';
export { IncidentAnalyzer } from './incident-analyzer';
export type { IncidentAnalysis, IncidentAnalyzerConfig } from './incident-analyzer';
