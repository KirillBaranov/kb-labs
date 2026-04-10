/**
 * @module @kb-labs/core-runtime/core/resource-manager
 * In-memory resource manager with quota enforcement.
 */

import type {
  IResourceManager,
  ResourceType,
  ResourceSlot,
  ResourceAvailability,
  TenantQuotas,
  ILogger,
  ICache,
} from '@kb-labs/core-platform';

/**
 * Default quotas for tenants without explicit configuration.
 */
const DEFAULT_QUOTAS: TenantQuotas = {
  maxConcurrentWorkflows: 5,
  maxConcurrentJobs: 10,
  maxQueuedJobs: 100,
  apiRequestsPerMinute: 1000,
  llmTokensPerDay: 100000,
  storageBytes: 1024 * 1024 * 1024, // 1GB
};

/**
 * Resource limits per type mapped to quota fields.
 */
const RESOURCE_QUOTA_MAP: Record<ResourceType, keyof TenantQuotas> = {
  workflow: 'maxConcurrentWorkflows',
  job: 'maxConcurrentJobs',
  llm: 'apiRequestsPerMinute',
  embedding: 'apiRequestsPerMinute',
  api: 'apiRequestsPerMinute',
};

export interface ResourceManagerConfig {
  /** Default quotas for new tenants */
  defaultQuotas?: Partial<TenantQuotas>;
  /** Slot expiration check interval in ms (default: 30000) */
  expirationCheckInterval?: number;
}

/**
 * In-memory resource manager with quota enforcement.
 * Tracks resource slots per tenant and enforces limits.
 */
export class ResourceManager implements IResourceManager {
  private slots = new Map<string, ResourceSlot>();
  private tenantSlots = new Map<string, Set<string>>();
  private quotas = new Map<string, TenantQuotas>();
  private defaultQuotas: TenantQuotas;
  private idCounter = 0;
  private expirationTimer?: ReturnType<typeof setInterval>;

  constructor(
    private cache: ICache,
    private logger: ILogger,
    config: ResourceManagerConfig = {}
  ) {
    this.defaultQuotas = { ...DEFAULT_QUOTAS, ...config.defaultQuotas };

    // Start expiration checker
    const interval = config.expirationCheckInterval ?? 30000;
    this.expirationTimer = setInterval(() => this.cleanupExpiredSlots(), interval);
  }

  /**
   * Acquire a resource slot for a tenant.
   * Returns null if quota exceeded.
   *
   * @param resource - Type of resource to acquire
   * @param tenantId - Tenant identifier
   * @param timeout - Optional slot expiration timeout in ms
   * @returns Resource slot if available, null if quota exceeded
   */
  async acquireSlot(
    resource: ResourceType,
    tenantId: string,
    timeout?: number
  ): Promise<ResourceSlot | null> {
    const quota = await this.getQuota(tenantId);
    const current = this.getResourceCount(resource, tenantId);
    const max = this.getMaxForResource(quota, resource);

    if (current >= max) {
      this.logger.warn('Resource quota exceeded', {
        resource,
        tenantId,
        current,
        max,
      });
      return null;
    }

    const slot: ResourceSlot = {
      id: `slot-${++this.idCounter}-${Date.now()}`,
      resource,
      tenantId,
      acquiredAt: new Date(),
      expiresAt: timeout ? new Date(Date.now() + timeout) : undefined,
    };

    // Store slot
    this.slots.set(slot.id, slot);

    // Track by tenant
    let tenantSet = this.tenantSlots.get(tenantId);
    if (!tenantSet) {
      tenantSet = new Set();
      this.tenantSlots.set(tenantId, tenantSet);
    }
    tenantSet.add(slot.id);

    this.logger.debug('Resource slot acquired', {
      slotId: slot.id,
      resource,
      tenantId,
      expiresAt: slot.expiresAt,
    });

    return slot;
  }

  /**
   * Release a previously acquired resource slot.
   * Frees up quota for the tenant.
   *
   * @param slot - Slot to release
   */
  async releaseSlot(slot: ResourceSlot): Promise<void> {
    if (!this.slots.has(slot.id)) {
      this.logger.warn('Attempted to release unknown slot', { slotId: slot.id });
      return;
    }

    this.slots.delete(slot.id);

    const tenantSet = this.tenantSlots.get(slot.tenantId);
    if (tenantSet) {
      tenantSet.delete(slot.id);
      if (tenantSet.size === 0) {
        this.tenantSlots.delete(slot.tenantId);
      }
    }

    this.logger.debug('Resource slot released', {
      slotId: slot.id,
      resource: slot.resource,
      tenantId: slot.tenantId,
    });
  }

  /**
   * Get resource availability statistics.
   * If tenantId provided, returns tenant-specific stats.
   * Otherwise, returns global platform stats.
   *
   * @param resource - Type of resource
   * @param tenantId - Optional tenant filter
   * @returns Resource availability stats
   */
  async getAvailability(
    resource: ResourceType,
    tenantId?: string
  ): Promise<ResourceAvailability> {
    if (tenantId) {
      const quota = await this.getQuota(tenantId);
      const max = this.getMaxForResource(quota, resource);
      const used = this.getResourceCount(resource, tenantId);

      return {
        resource,
        total: max,
        used,
        available: Math.max(0, max - used),
        queueLength: 0, // In-memory implementation doesn't queue
      };
    }

    // Global availability (all tenants)
    let totalUsed = 0;
    for (const slot of this.slots.values()) {
      if (slot.resource === resource) {
        totalUsed++;
      }
    }

    return {
      resource,
      total: Number.MAX_SAFE_INTEGER,
      used: totalUsed,
      available: Number.MAX_SAFE_INTEGER,
      queueLength: 0,
    };
  }

  /**
   * Set custom quotas for a tenant.
   * Merges with default quotas and persists to cache.
   *
   * @param tenantId - Tenant identifier
   * @param quotas - Partial quotas to update
   */
  async setQuota(tenantId: string, quotas: Partial<TenantQuotas>): Promise<void> {
    const existing = this.quotas.get(tenantId) ?? { ...this.defaultQuotas };
    const updated = { ...existing, ...quotas };
    this.quotas.set(tenantId, updated);

    // Optionally persist to cache for cross-process consistency
    await this.cache.set(`quota:${tenantId}`, updated);

    this.logger.info('Tenant quota updated', { tenantId, quotas: updated });
  }

  /**
   * Get quota configuration for a tenant.
   * Returns defaults if no custom quotas set.
   *
   * @param tenantId - Tenant identifier
   * @returns Tenant quota configuration
   */
  async getQuota(tenantId: string): Promise<TenantQuotas> {
    // Check local cache first
    const cached = this.quotas.get(tenantId);
    if (cached) {return cached;}

    // Try to load from cache
    const stored = await this.cache.get<TenantQuotas>(`quota:${tenantId}`);
    if (stored) {
      this.quotas.set(tenantId, stored);
      return stored;
    }

    // Return defaults
    return { ...this.defaultQuotas };
  }

  /**
   * Get count of active slots for a resource type and tenant.
   */
  private getResourceCount(resource: ResourceType, tenantId: string): number {
    const tenantSet = this.tenantSlots.get(tenantId);
    if (!tenantSet) {return 0;}

    let count = 0;
    for (const slotId of tenantSet) {
      const slot = this.slots.get(slotId);
      if (slot?.resource === resource) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get max allowed for a resource type from quotas.
   */
  private getMaxForResource(quota: TenantQuotas, resource: ResourceType): number {
    const field = RESOURCE_QUOTA_MAP[resource];
    return quota[field] as number;
  }

  /**
   * Clean up expired slots.
   */
  private cleanupExpiredSlots(): void {
    const now = Date.now();
    const expired: ResourceSlot[] = [];

    for (const slot of this.slots.values()) {
      if (slot.expiresAt && slot.expiresAt.getTime() < now) {
        expired.push(slot);
      }
    }

    for (const slot of expired) {
      this.releaseSlot(slot);
      this.logger.debug('Expired slot cleaned up', { slotId: slot.id });
    }
  }

  /**
   * Stop the expiration timer (for cleanup).
   */
  dispose(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = undefined;
    }
  }

  /**
   * Get current stats (for monitoring).
   */
  getStats(): {
    totalSlots: number;
    slotsByResource: Record<ResourceType, number>;
    tenantCount: number;
  } {
    const slotsByResource: Record<ResourceType, number> = {
      workflow: 0,
      job: 0,
      llm: 0,
      embedding: 0,
      api: 0,
    };

    for (const slot of this.slots.values()) {
      slotsByResource[slot.resource]++;
    }

    return {
      totalSlots: this.slots.size,
      slotsByResource,
      tenantCount: this.tenantSlots.size,
    };
  }
}
