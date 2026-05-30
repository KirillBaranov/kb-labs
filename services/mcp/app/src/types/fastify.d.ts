import type { ILogger } from '@kb-labs/core-platform';

declare module 'fastify' {
  interface FastifyRequest {
    /** Per-request correlated logger — set by the onRequest hook in server.ts. */
    kbLogger: ILogger;
    /** Request start timestamp (performance.now()) set by the observability collector. */
    kbMetricsStart?: number;
  }
}
