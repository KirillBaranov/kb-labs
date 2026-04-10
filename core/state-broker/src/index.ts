/**
 * @module @kb-labs/core-state-broker
 * Universal state broker for persistent cross-invocation state
 */

/**
 * Stored value with metadata
 */
export interface StoredValue<T = unknown> {
  /** Schema version for migrations */
  version: number;
  /** Actual data */
  data: T;
  /** Metadata */
  metadata: {
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
  };
}

/**
 * Broker statistics
 */
export interface BrokerStats {
  /** Uptime in milliseconds */
  uptime: number;
  /** Total number of entries */
  totalEntries: number;
  /** Total size in bytes (estimated) */
  totalSize: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Cache miss rate (0-1) */
  missRate: number;
  /** Number of evictions */
  evictions: number;
  /** Stats per namespace */
  namespaces: Record<string, NamespaceStats>;
  /** Stats per tenant (multi-tenancy support) */
  byTenant?: Record<string, TenantStats>;
}

/**
 * Namespace statistics
 */
export interface NamespaceStats {
  entries: number;
  size: number;
  oldestEntry: number;
}

/**
 * Tenant statistics (multi-tenancy)
 */
export interface TenantStats {
  entries: number;
  size: number;
  lastAccess: number;
}

/**
 * Health status
 */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'shutting_down';
  version: string;
  stats: BrokerStats;
}

/**
 * State broker interface
 */
export interface StateBroker {
  /**
   * Get value by key
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value with TTL
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete value
   */
  delete(key: string): Promise<void>;

  /**
   * Clear entries by pattern
   */
  clear(pattern?: string): Promise<void>;

  /**
   * Get broker statistics
   */
  getStats(): Promise<BrokerStats>;

  /**
   * Get health status
   */
  getHealth(): Promise<HealthStatus>;

  /**
   * Stop broker (cleanup)
   */
  stop(): Promise<void>;
}

/**
 * State broker options
 */
export interface StateBrokerOptions {
  /** Backend type */
  backend?: 'memory' | 'http';
  /** URL for HTTP backend */
  url?: string;
  /** Namespace prefix */
  namespace?: string;
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Export backends
export { InMemoryStateBroker } from './backends/in-memory';
export { HTTPStateBroker } from './backends/http';

// Export factory
export { createStateBroker, detectStateBroker } from './factory';
