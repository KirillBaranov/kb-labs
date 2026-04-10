/**
 * Standardized error codes shared across CLI, REST and Studio.
 * These values intentionally line up with the codes used by the
 * plugin runtime so adapters can map them to HTTP status codes.
 */
export enum ErrorCode {
  INTERNAL = 'INTERNAL',
  PLUGIN_PERMISSION_DENIED = 'PLUGIN_PERMISSION_DENIED',
  PLUGIN_CAPABILITY_MISSING = 'PLUGIN_CAPABILITY_MISSING',
  PLUGIN_HANDLER_NOT_FOUND = 'PLUGIN_HANDLER_NOT_FOUND',
  PLUGIN_TIMEOUT = 'PLUGIN_TIMEOUT',
  PLUGIN_SCHEMA_VALIDATION_FAILED = 'PLUGIN_SCHEMA_VALIDATION_FAILED',
  PLUGIN_ARTIFACT_FAILED = 'PLUGIN_ARTIFACT_FAILED',
  PLUGIN_QUOTA_EXCEEDED = 'PLUGIN_QUOTA_EXCEEDED',
  ARTIFACT_READ_DENIED = 'ARTIFACT_READ_DENIED',
  ARTIFACT_WRITE_DENIED = 'ARTIFACT_WRITE_DENIED',
  CONFLICT = 'CONFLICT',
}

/**
 * Helper describing a compact permission summary.
 */
export interface PermissionSummary {
  fs?: {
    mode?: string;
    allowCount?: number;
    denyCount?: number;
  };
  net?: 'none' | { allowHostsCount?: number; denyHostsCount?: number };
  env?: { allowCount?: number };
  quotas?: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuMs?: number;
  };
  capabilities?: string[];
}

/**
 * Permissions diff emitted when the runtime compares required
 * vs granted permissions for a failing invocation.
 */
export interface PermissionDiff {
  required?: string[];
  granted?: string[];
}

