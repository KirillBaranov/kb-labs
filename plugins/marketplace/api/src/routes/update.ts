import '../types.js';
import type { FastifyInstance } from 'fastify';

export function updateRoute(app: FastifyInstance): void {
  app.post('/update', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Update installed package(s)',
      body: {
        type: 'object',
        properties: {
          packageIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { packageIds } = (request.body as { packageIds?: string[] }) ?? {};
    const service = app.marketplace;
    const result = await app.observability.observeOperation('marketplace.update', () => service.update(packageIds));
    return reply.send(result);
  });
}
