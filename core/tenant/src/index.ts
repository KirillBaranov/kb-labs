/**
 * @module @kb-labs/tenant
 * Multi-tenancy primitives for KB Labs
 *
 * Provides tenant management, quotas, and rate limiting
 * using existing infrastructure (State Broker, LogContext, Prometheus)
 */

export * from './types';
export * from './rate-limiter';
