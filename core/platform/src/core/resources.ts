/**
 * @module @kb-labs/core-platform/core/resources
 * Resource manager interface for quotas and rate limiting.
 */

/**
 * Resource types that can be limited.
 */
export type ResourceType = 'workflow' | 'job' | 'llm' | 'embedding' | 'api';

/**
 * Resource slot acquired for usage.
 */
export interface ResourceSlot {
  /** Slot identifier */
  id: string;
  /** Resource type */
  resource: ResourceType;
  /** Tenant identifier */
  tenantId: string;
  /** Acquisition time */
  acquiredAt: Date;
  /** Expiration time (if timeout specified) */
  expiresAt?: Date;
}

/**
 * Tenant quota configuration.
 */
export interface TenantQuotas {
  /** Maximum concurrent workflows */
  maxConcurrentWorkflows: number;
  /** Maximum concurrent jobs */
  maxConcurrentJobs: number;
  /** Maximum queued jobs */
  maxQueuedJobs: number;
  /** API requests per minute */
  apiRequestsPerMinute: number;
  /** LLM tokens per day */
  llmTokensPerDay: number;
  /** Storage in bytes */
  storageBytes: number;
}

/**
 * Resource availability info.
 */
export interface ResourceAvailability {
  /** Resource type */
  resource: ResourceType;
  /** Total capacity */
  total: number;
  /** Currently used */
  used: number;
  /** Available slots */
  available: number;
  /** Queue length (waiting requests) */
  queueLength: number;
}

/**
 * Resource manager interface.
 * Core feature - implemented in @kb-labs/core-runtime, not replaceable.
 */
export interface IResourceManager {
  /**
   * Acquire a resource slot.
   * @param resource - Resource type
   * @param tenantId - Tenant identifier
   * @param timeout - Optional slot timeout in milliseconds
   * @returns Resource slot or null if quota exceeded
   */
  acquireSlot(resource: ResourceType, tenantId: string, timeout?: number): Promise<ResourceSlot | null>;

  /**
   * Release a resource slot.
   * @param slot - Resource slot to release
   */
  releaseSlot(slot: ResourceSlot): Promise<void>;

  /**
   * Get resource availability.
   * @param resource - Resource type
   * @param tenantId - Optional tenant for tenant-specific availability
   */
  getAvailability(resource: ResourceType, tenantId?: string): Promise<ResourceAvailability>;

  /**
   * Set quotas for a tenant.
   * @param tenantId - Tenant identifier
   * @param quotas - Partial quota configuration
   */
  setQuota(tenantId: string, quotas: Partial<TenantQuotas>): Promise<void>;

  /**
   * Get quotas for a tenant.
   * @param tenantId - Tenant identifier
   */
  getQuota(tenantId: string): Promise<TenantQuotas>;
}
