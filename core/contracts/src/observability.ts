/**
 * @module @kb-labs/core-contracts/observability
 * Versioned observability contract shared by KB Labs services.
 */

export const OBSERVABILITY_CONTRACT_VERSION = '1.0';
export const OBSERVABILITY_SCHEMA = 'kb.observability/1';

export const OBSERVABILITY_CAPABILITIES = [
  'httpMetrics',
  'eventLoopMetrics',
  'operationMetrics',
  'logCorrelation',
  'diagnosisHints',
  'llmContext',
] as const;

export type ObservabilityCapability = (typeof OBSERVABILITY_CAPABILITIES)[number];

export const CANONICAL_OBSERVABILITY_METRICS = [
  'process_cpu_percent',
  'process_rss_bytes',
  'process_heap_used_bytes',
  'process_event_loop_lag_ms',
  'service_health_status',
  'service_restarts_total',
  'service_active_operations',
  'http_requests_total',
  'http_errors_total',
  'http_request_duration_ms',
  'service_operation_total',
  'service_operation_duration_ms',
] as const;

export type CanonicalObservabilityMetric = (typeof CANONICAL_OBSERVABILITY_METRICS)[number];

export const CANONICAL_SERVICE_LOG_FIELDS = [
  'serviceId',
  'instanceId',
  'logsSource',
  'requestId',
  'reqId',
  'traceId',
  'operation',
  'route',
  'method',
  'url',
] as const;

export type CanonicalServiceLogField = (typeof CANONICAL_SERVICE_LOG_FIELDS)[number];

export const DIAGNOSTIC_REASON_CODES = [
  'snapshot_stale',
  'snapshot_partial',
  'registry_restore_failed',
  'manifest_missing',
  'manifest_invalid',
  'manifest_load_timeout',
  'integrity_mismatch',
  'plugin_discovery_failed',
  'version_mismatch',
  'handler_not_found',
  'module_import_failed',
  'export_missing',
  'zod_validation_failed',
  'execution_host_unavailable',
  'execution_dispatch_failed',
  'route_validation_failed',
  'route_mount_failed',
  'ws_mount_failed',
  'registry_refresh_failed',
  'upstream_unavailable',
  'websocket_auth_failed',
  'websocket_hello_timeout',
  'websocket_handshake_invalid',
  'websocket_protocol_unsupported',
  'websocket_message_invalid',
  'adapter_call_rejected',
  'adapter_bridge_unavailable',
  'workspace_provision_failed',
  'workspace_provision_timeout',
  'worker_loop_error',
] as const;

export type DiagnosticReasonCode = (typeof DIAGNOSTIC_REASON_CODES)[number];

export type ServiceObservabilityState =
  | 'active'
  | 'stale'
  | 'dead'
  | 'overloaded'
  | 'partial_observability'
  | 'unsupported_contract_version'
  | 'insufficient_data';

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type ObservabilityCheckStatus = 'ok' | 'warn' | 'error';

export interface ServiceDependencyDescriptor {
  serviceId: string;
  required: boolean;
  description?: string;
}

export interface ServiceObservabilityDescribe {
  schema: typeof OBSERVABILITY_SCHEMA;
  contractVersion: typeof OBSERVABILITY_CONTRACT_VERSION;
  serviceId: string;
  instanceId: string;
  serviceType: string;
  version: string;
  environment: string;
  startedAt: string;
  dependencies: ServiceDependencyDescriptor[];
  metricsEndpoint: string;
  healthEndpoint: string;
  logsSource: string;
  capabilities: ObservabilityCapability[];
  metricFamilies: CanonicalObservabilityMetric[];
}

export interface ObservabilityCheck {
  id: string;
  status: ObservabilityCheckStatus;
  message?: string;
  latencyMs?: number;
}

export interface ResourceSnapshot {
  cpuPercent?: number;
  rssBytes?: number;
  heapUsedBytes?: number;
  eventLoopLagMs?: number;
  activeOperations?: number;
}

export interface ServiceOperationSample {
  operation: string;
  count?: number;
  avgDurationMs?: number;
  maxDurationMs?: number;
  errorCount?: number;
}

export interface ServiceLogCorrelationContext {
  serviceId: string;
  instanceId: string;
  logsSource: string;
  requestId?: string;
  reqId?: string;
  traceId?: string;
  operation?: string;
  route?: string;
  method?: string;
  url?: string;
}

export interface ServiceObservabilityHealth {
  schema: typeof OBSERVABILITY_SCHEMA;
  contractVersion: typeof OBSERVABILITY_CONTRACT_VERSION;
  serviceId: string;
  instanceId: string;
  observedAt: string;
  status: ServiceHealthStatus;
  uptimeSec: number;
  metricsEndpoint: string;
  logsSource: string;
  capabilities: ObservabilityCapability[];
  checks: ObservabilityCheck[];
  snapshot?: ResourceSnapshot;
  topOperations?: ServiceOperationSample[];
  state?: ServiceObservabilityState;
  meta?: Record<string, unknown>;
}

export interface DiagnosisSuspect {
  type: 'route' | 'operation' | 'dependency' | 'runtime' | 'log-pattern' | 'unknown';
  id: string;
  confidence: number;
  reason: string;
}

export interface DiagnosisEvidence {
  type: 'metric' | 'log' | 'timeline' | 'state' | 'gap';
  source: string;
  summary: string;
  ts?: string;
  data?: Record<string, unknown>;
}

export interface EvidenceBundle {
  service: Pick<ServiceObservabilityDescribe, 'serviceId' | 'instanceId' | 'serviceType' | 'version' | 'environment'>;
  snapshot?: ResourceSnapshot;
  checks?: ObservabilityCheck[];
  topOperations?: ServiceOperationSample[];
  suspects?: DiagnosisSuspect[];
  evidence?: DiagnosisEvidence[];
  dataGaps?: string[];
  recommendedActions?: string[];
  provenance?: Array<{
    source: string;
    kind: 'metrics' | 'logs' | 'health' | 'events' | 'derived';
    collectedAt?: string;
  }>;
}

export type ObservabilityValidationIssue = {
  path: string;
  message: string;
};

export type ObservabilityValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ObservabilityValidationIssue[] };

export type ObservabilityMetricCompliance = {
  ok: boolean;
  present: CanonicalObservabilityMetric[];
  missing: CanonicalObservabilityMetric[];
};

const OBSERVABILITY_CAPABILITY_SET = new Set<string>(OBSERVABILITY_CAPABILITIES);
const CANONICAL_METRIC_SET = new Set<string>(CANONICAL_OBSERVABILITY_METRICS);
const OBSERVABILITY_STATE_SET = new Set<ServiceObservabilityState>([
  'active',
  'stale',
  'dead',
  'overloaded',
  'partial_observability',
  'unsupported_contract_version',
  'insufficient_data',
]);
const SERVICE_HEALTH_STATUS_SET = new Set<ServiceHealthStatus>([
  'healthy',
  'degraded',
  'unhealthy',
]);
const OBSERVABILITY_CHECK_STATUS_SET = new Set<ObservabilityCheckStatus>([
  'ok',
  'warn',
  'error',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pushIssue(
  issues: ObservabilityValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCommonIdentityFields(
  payload: Record<string, unknown>,
  issues: ObservabilityValidationIssue[],
): void {
  if (payload.schema !== OBSERVABILITY_SCHEMA) {
    pushIssue(issues, 'schema', `expected ${OBSERVABILITY_SCHEMA}`);
  }

  if (payload.contractVersion !== OBSERVABILITY_CONTRACT_VERSION) {
    pushIssue(issues, 'contractVersion', `expected ${OBSERVABILITY_CONTRACT_VERSION}`);
  }

  for (const field of ['serviceId', 'instanceId'] as const) {
    if (typeof payload[field] !== 'string' || payload[field].trim().length === 0) {
      pushIssue(issues, field, 'must be a non-empty string');
    }
  }
}

export function isObservabilityCapability(value: unknown): value is ObservabilityCapability {
  return typeof value === 'string' && OBSERVABILITY_CAPABILITY_SET.has(value);
}

export function isCanonicalObservabilityMetric(value: unknown): value is CanonicalObservabilityMetric {
  return typeof value === 'string' && CANONICAL_METRIC_SET.has(value);
}

export function validateServiceObservabilityDescribe(
  value: unknown,
): ObservabilityValidationResult<ServiceObservabilityDescribe> {
  const issues: ObservabilityValidationIssue[] = [];

  if (!isObject(value)) {
    return { ok: false, issues: [{ path: '', message: 'payload must be an object' }] };
  }

  validateCommonIdentityFields(value, issues);

  for (const field of ['serviceType', 'version', 'environment', 'metricsEndpoint', 'healthEndpoint', 'logsSource'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      pushIssue(issues, field, 'must be a non-empty string');
    }
  }

  if (!isIsoDate(value.startedAt)) {
    pushIssue(issues, 'startedAt', 'must be a valid ISO date string');
  }

  if (!Array.isArray(value.dependencies)) {
    pushIssue(issues, 'dependencies', 'must be an array');
  } else {
    value.dependencies.forEach((dependency, index) => {
      if (!isObject(dependency)) {
        pushIssue(issues, `dependencies.${index}`, 'must be an object');
        return;
      }
      if (typeof dependency.serviceId !== 'string' || dependency.serviceId.trim().length === 0) {
        pushIssue(issues, `dependencies.${index}.serviceId`, 'must be a non-empty string');
      }
      if (typeof dependency.required !== 'boolean') {
        pushIssue(issues, `dependencies.${index}.required`, 'must be a boolean');
      }
      if (
        dependency.description !== undefined &&
        (typeof dependency.description !== 'string' || dependency.description.trim().length === 0)
      ) {
        pushIssue(issues, `dependencies.${index}.description`, 'must be a non-empty string when present');
      }
    });
  }

  if (!Array.isArray(value.capabilities)) {
    pushIssue(issues, 'capabilities', 'must be an array');
  } else {
    value.capabilities.forEach((capability, index) => {
      if (!isObservabilityCapability(capability)) {
        pushIssue(issues, `capabilities.${index}`, 'must be a known observability capability');
      }
    });
  }

  if (!Array.isArray(value.metricFamilies)) {
    pushIssue(issues, 'metricFamilies', 'must be an array');
  } else {
    value.metricFamilies.forEach((metric, index) => {
      if (!isCanonicalObservabilityMetric(metric)) {
        pushIssue(issues, `metricFamilies.${index}`, 'must be a canonical observability metric family');
      }
    });
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as ServiceObservabilityDescribe };
}

export function validateServiceObservabilityHealth(
  value: unknown,
): ObservabilityValidationResult<ServiceObservabilityHealth> {
  const issues: ObservabilityValidationIssue[] = [];

  if (!isObject(value)) {
    return { ok: false, issues: [{ path: '', message: 'payload must be an object' }] };
  }

  validateCommonIdentityFields(value, issues);

  if (!isIsoDate(value.observedAt)) {
    pushIssue(issues, 'observedAt', 'must be a valid ISO date string');
  }

  if (!SERVICE_HEALTH_STATUS_SET.has(value.status as ServiceHealthStatus)) {
    pushIssue(issues, 'status', 'must be one of healthy, degraded, unhealthy');
  }

  if (!isFiniteNumber(value.uptimeSec) || value.uptimeSec < 0) {
    pushIssue(issues, 'uptimeSec', 'must be a non-negative number');
  }

  for (const field of ['metricsEndpoint', 'logsSource'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      pushIssue(issues, field, 'must be a non-empty string');
    }
  }

  if (!Array.isArray(value.capabilities)) {
    pushIssue(issues, 'capabilities', 'must be an array');
  } else {
    value.capabilities.forEach((capability, index) => {
      if (!isObservabilityCapability(capability)) {
        pushIssue(issues, `capabilities.${index}`, 'must be a known observability capability');
      }
    });
  }

  if (!Array.isArray(value.checks)) {
    pushIssue(issues, 'checks', 'must be an array');
  } else {
    value.checks.forEach((check, index) => {
      if (!isObject(check)) {
        pushIssue(issues, `checks.${index}`, 'must be an object');
        return;
      }
      if (typeof check.id !== 'string' || check.id.trim().length === 0) {
        pushIssue(issues, `checks.${index}.id`, 'must be a non-empty string');
      }
      if (!OBSERVABILITY_CHECK_STATUS_SET.has(check.status as ObservabilityCheckStatus)) {
        pushIssue(issues, `checks.${index}.status`, 'must be one of ok, warn, error');
      }
      if (check.message !== undefined && typeof check.message !== 'string') {
        pushIssue(issues, `checks.${index}.message`, 'must be a string when present');
      }
      if (check.latencyMs !== undefined && !isFiniteNumber(check.latencyMs)) {
        pushIssue(issues, `checks.${index}.latencyMs`, 'must be a finite number when present');
      }
    });
  }

  if (value.snapshot !== undefined) {
    if (!isObject(value.snapshot)) {
      pushIssue(issues, 'snapshot', 'must be an object when present');
    } else {
      for (const field of ['cpuPercent', 'rssBytes', 'heapUsedBytes', 'eventLoopLagMs', 'activeOperations'] as const) {
        const nested = value.snapshot[field];
        if (nested !== undefined && !isFiniteNumber(nested)) {
          pushIssue(issues, `snapshot.${field}`, 'must be a finite number when present');
        }
      }
    }
  }

  if (value.topOperations !== undefined) {
    if (!Array.isArray(value.topOperations)) {
      pushIssue(issues, 'topOperations', 'must be an array when present');
    } else {
      value.topOperations.forEach((sample, index) => {
        if (!isObject(sample)) {
          pushIssue(issues, `topOperations.${index}`, 'must be an object');
          return;
        }
        if (typeof sample.operation !== 'string' || sample.operation.trim().length === 0) {
          pushIssue(issues, `topOperations.${index}.operation`, 'must be a non-empty string');
        }
        for (const field of ['count', 'avgDurationMs', 'maxDurationMs', 'errorCount'] as const) {
          const nested = sample[field];
          if (nested !== undefined && !isFiniteNumber(nested)) {
            pushIssue(issues, `topOperations.${index}.${field}`, 'must be a finite number when present');
          }
        }
      });
    }
  }

  if (value.state !== undefined && !OBSERVABILITY_STATE_SET.has(value.state as ServiceObservabilityState)) {
    pushIssue(issues, 'state', 'must be a known observability state');
  }

  if (value.meta !== undefined && !isObject(value.meta)) {
    pushIssue(issues, 'meta', 'must be an object when present');
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as ServiceObservabilityHealth };
}

export function extractPrometheusMetricFamilies(metricsText: string): string[] {
  const families = new Set<string>();

  for (const line of metricsText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const commentMatch = trimmed.match(/^#\s+(HELP|TYPE)\s+([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    const metricMatch = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    const metricName = commentMatch?.[2] ?? metricMatch?.[1];
    if (!metricName) {
      continue;
    }

    const family = metricName
      .replace(/_(bucket|sum|count)$/u, '');
    families.add(family);
  }

  return Array.from(families).sort();
}

export function checkCanonicalObservabilityMetrics(metricsText: string): ObservabilityMetricCompliance {
  const presentFamilies = new Set(extractPrometheusMetricFamilies(metricsText));
  const present = CANONICAL_OBSERVABILITY_METRICS.filter((metric) => presentFamilies.has(metric));
  const missing = CANONICAL_OBSERVABILITY_METRICS.filter((metric) => !presentFamilies.has(metric));

  return {
    ok: missing.length === 0,
    present: [...present],
    missing: [...missing],
  };
}
