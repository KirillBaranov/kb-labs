/**
 * @module @kb-labs/core-platform/noop/core/resources
 * NoOp resource manager implementation.
 */

import type {
  IResourceManager,
  ResourceType,
  ResourceSlot,
  ResourceAvailability,
  TenantQuotas,
} from '../../core/resources.js';

/**
 * Default unlimited quotas for NoOp mode.
 */
const UNLIMITED_QUOTAS: TenantQuotas = {
  maxConcurrentWorkflows: Number.MAX_SAFE_INTEGER,
  maxConcurrentJobs: Number.MAX_SAFE_INTEGER,
  maxQueuedJobs: Number.MAX_SAFE_INTEGER,
  apiRequestsPerMinute: Number.MAX_SAFE_INTEGER,
  llmTokensPerDay: Number.MAX_SAFE_INTEGER,
  storageBytes: Number.MAX_SAFE_INTEGER,
};

/**
 * NoOp resource manager that always allows resource acquisition.
 * No actual quota enforcement - useful for testing.
 */
export class NoOpResourceManager implements IResourceManager {
  private quotas = new Map<string, TenantQuotas>();
  private slots = new Map<string, ResourceSlot>();
  private idCounter = 0;

  async acquireSlot(
    resource: ResourceType,
    tenantId: string,
    timeout?: number
  ): Promise<ResourceSlot | null> {
    const slot: ResourceSlot = {
      id: `noop-slot-${++this.idCounter}`,
      resource,
      tenantId,
      acquiredAt: new Date(),
      expiresAt: timeout ? new Date(Date.now() + timeout) : undefined,
    };

    this.slots.set(slot.id, slot);
    return slot;
  }

  async releaseSlot(slot: ResourceSlot): Promise<void> {
    this.slots.delete(slot.id);
  }

  async getAvailability(
    resource: ResourceType,
    tenantId?: string
  ): Promise<ResourceAvailability> {
    const usedSlots = Array.from(this.slots.values()).filter(
      (s) =>
        s.resource === resource && (!tenantId || s.tenantId === tenantId)
    );

    return {
      resource,
      total: Number.MAX_SAFE_INTEGER,
      used: usedSlots.length,
      available: Number.MAX_SAFE_INTEGER,
      queueLength: 0,
    };
  }

  async setQuota(tenantId: string, quotas: Partial<TenantQuotas>): Promise<void> {
    const existing = this.quotas.get(tenantId) ?? { ...UNLIMITED_QUOTAS };
    this.quotas.set(tenantId, { ...existing, ...quotas });
  }

  async getQuota(tenantId: string): Promise<TenantQuotas> {
    return this.quotas.get(tenantId) ?? { ...UNLIMITED_QUOTAS };
  }

  /**
   * Get the current number of active slots (for testing).
   */
  get activeSlotCount(): number {
    return this.slots.size;
  }

  /**
   * Clear all slots and quotas (for testing).
   */
  clear(): void {
    this.slots.clear();
    this.quotas.clear();
    this.idCounter = 0;
  }
}
