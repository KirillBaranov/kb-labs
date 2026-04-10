import '../types.js';
import type { FastifyInstance } from 'fastify';

export function doctorRoute(app: FastifyInstance): void {
  app.get('/doctor', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Diagnose marketplace health',
    },
  }, async (_request, reply) => {
    const service = app.marketplace;
    const report = await app.observability.observeOperation('marketplace.doctor', () => service.doctor());
    return reply.send(report);
  });
}
