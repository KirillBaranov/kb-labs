import {
  validateServiceObservabilityDescribe,
  validateServiceObservabilityHealth,
} from '@kb-labs/core-contracts';

export interface VersionedObservabilityShape {
  schema: string;
  contractVersion: string;
}

export interface ServiceReadyResponse {
  schema: 'kb.ready/1';
  ts: string;
  ready: boolean;
  status: 'ready' | 'degraded' | 'initializing';
  reason: string;
  components: Record<string, unknown>;
}

/**
 * Shared builder for versioned service describe payloads.
 * Keeps services on a single construction path instead of ad hoc objects.
 */
export function createServiceObservabilityDescribe<T extends VersionedObservabilityShape>(options: T): T {
  const result = validateServiceObservabilityDescribe(options);
  if (!result.ok) {
    throw new Error(
      `Invalid observability describe payload: ${result.issues.map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`).join(', ')}`,
    );
  }
  return options;
}

/**
 * Shared builder for versioned service health payloads.
 * Callers provide the contract-specific shape while keeping a common entry point.
 */
export function createServiceObservabilityHealth<T extends VersionedObservabilityShape>(options: T): T {
  const result = validateServiceObservabilityHealth(options);
  if (!result.ok) {
    throw new Error(
      `Invalid observability health payload: ${result.issues.map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`).join(', ')}`,
    );
  }
  return options;
}

export function createServiceReadyResponse(options: {
  ready: boolean;
  status?: ServiceReadyResponse['status'];
  reason?: string;
  components?: Record<string, unknown>;
  ts?: string;
}): ServiceReadyResponse {
  return {
    schema: 'kb.ready/1',
    ts: options.ts ?? new Date().toISOString(),
    ready: options.ready,
    status: options.status ?? (options.ready ? 'ready' : 'initializing'),
    reason: options.reason ?? (options.ready ? 'ready' : 'initializing'),
    components: options.components ?? {},
  };
}
