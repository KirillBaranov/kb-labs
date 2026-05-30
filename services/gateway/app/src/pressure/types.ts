/**
 * @module pressure/types
 * Fastify request augmentation for pressure-control release handles.
 *
 * Each allowed `tryAcquire` adds its release closure here; the `onResponse`
 * hook iterates and releases them all. Idempotency of `release` (guaranteed
 * by core ResourceBroker) makes double-fire from `onResponse` + `raw.on('close')`
 * safe.
 */

import type {} from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    pressureReleases?: Array<() => Promise<void>>;
  }
}
