/**
 * Environment API for plugin-controlled long-lived environments.
 */

/**
 * Environment lifecycle status.
 */
export type EnvironmentStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'degraded'
  | 'terminating'
  | 'terminated'
  | 'failed';

/**
 * Environment resource request.
 */
export interface EnvironmentResources {
  cpu?: string;
  memory?: string;
  disk?: string;
  gpu?: string;
}

/**
 * Environment lease descriptor.
 */
export interface EnvironmentLeaseInfo {
  leaseId: string;
  acquiredAt: string;
  expiresAt: string;
  owner?: string;
}

/**
 * Environment endpoint descriptor.
 */
export interface EnvironmentEndpointInfo {
  name: string;
  protocol?: 'http' | 'https' | 'tcp' | 'udp' | 'unix';
  host?: string;
  port?: number;
  path?: string;
}

/**
 * Create environment request.
 */
export interface EnvironmentCreateRequest {
  tenantId?: string;
  namespace?: string;
  runId?: string;
  templateId?: string;
  image?: string;
  workspacePath?: string;
  command?: string[];
  env?: Record<string, string>;
  resources?: EnvironmentResources;
  ttlMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Created environment details.
 */
export interface EnvironmentInfo {
  environmentId: string;
  provider: string;
  status: EnvironmentStatus;
  createdAt: string;
  updatedAt: string;
  lease?: EnvironmentLeaseInfo;
  endpoints?: EnvironmentEndpointInfo[];
  metadata?: Record<string, unknown>;
}

/**
 * Runtime environment status response.
 */
export interface EnvironmentStatusInfo {
  environmentId: string;
  status: EnvironmentStatus;
  reason?: string;
  updatedAt: string;
  lease?: EnvironmentLeaseInfo;
}

/**
 * API for environment lifecycle operations.
 */
export interface EnvironmentAPI {
  /**
   * Provision a new environment.
   */
  create(request: EnvironmentCreateRequest): Promise<EnvironmentInfo>;

  /**
   * Get current environment status.
   */
  status(environmentId: string): Promise<EnvironmentStatusInfo>;

  /**
   * Destroy environment.
   */
  destroy(environmentId: string, reason?: string): Promise<void>;

  /**
   * Renew environment lease.
   */
  renewLease(environmentId: string, ttlMs: number): Promise<EnvironmentLeaseInfo>;
}
