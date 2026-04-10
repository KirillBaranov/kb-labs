/**
 * @module @kb-labs/tenant/types
 * Multi-tenancy types and quota definitions
 */

/**
 * Tenant tier levels
 */
export type TenantTier = 'free' | 'pro' | 'enterprise';

/**
 * Tenant resource quotas
 */
export interface TenantQuotas {
  /** Requests per minute limit */
  requestsPerMinute: number;
  /** Requests per day limit (-1 = unlimited) */
  requestsPerDay: number;
  /** Maximum concurrent workflows */
  maxConcurrentWorkflows: number;
  /** Maximum storage in MB */
  maxStorageMB: number;
  /** Plugin executions per day (-1 = unlimited) */
  pluginExecutionsPerDay: number;
}

/**
 * Tenant configuration
 */
export interface TenantConfig {
  /** Unique tenant identifier */
  id: string;
  /** Tenant tier */
  tier: TenantTier;
  /** Resource quotas */
  quotas: TenantQuotas;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Default quotas by tier
 */
export const DEFAULT_QUOTAS: Record<TenantTier, TenantQuotas> = {
  free: {
    requestsPerMinute: 10,
    requestsPerDay: 1000,
    maxConcurrentWorkflows: 1,
    maxStorageMB: 10,
    pluginExecutionsPerDay: 100,
  },
  pro: {
    requestsPerMinute: 100,
    requestsPerDay: 100_000,
    maxConcurrentWorkflows: 10,
    maxStorageMB: 1000,
    pluginExecutionsPerDay: 10_000,
  },
  enterprise: {
    requestsPerMinute: 1000,
    requestsPerDay: -1, // unlimited
    maxConcurrentWorkflows: 100,
    maxStorageMB: 10_000,
    pluginExecutionsPerDay: -1, // unlimited
  },
};

/**
 * Get default tenant ID from environment
 * @returns Tenant ID (defaults to 'default' for single-tenant deployments)
 */
export function getDefaultTenantId(): string {
  return process.env.KB_TENANT_ID || 'default';
}

/**
 * Get default tenant tier from environment
 * @returns Tenant tier (defaults to 'free')
 */
export function getDefaultTenantTier(): TenantTier {
  const tier = process.env.KB_TENANT_DEFAULT_TIER?.toLowerCase();
  if (tier === 'pro' || tier === 'enterprise') {
    return tier;
  }
  return 'free';
}

/**
 * Get tenant quotas for a tier
 * @param tier - Tenant tier
 * @returns Quotas for the tier
 */
export function getQuotasForTier(tier: TenantTier): TenantQuotas {
  return { ...DEFAULT_QUOTAS[tier] };
}
