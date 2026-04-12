/**
 * @module @kb-labs/marketplace-api/routes/diagnostics
 * Service-level diagnostic endpoints.
 *
 * GET /diagnostics — marketplace health report
 */

import '../types.js';
import type { FastifyInstance } from 'fastify';

export function registerDiagnosticsRoutes(app: FastifyInstance): void {
  app.get('/diagnostics', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Marketplace health and diagnostics report',
    },
  }, async (_request, reply) => {
    const report = await app.observability.observeOperation(
      'marketplace.doctor',
      () => app.marketplace.doctor(),
    );
    return reply.send(report);
  });
}
