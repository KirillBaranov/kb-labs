import '../types.js';
import type { FastifyInstance } from 'fastify';
import type { EntityKind } from '@kb-labs/core-discovery';

export function listRoute(app: FastifyInstance): void {
  app.get('/list', {
    schema: {
      tags: ['Marketplace'],
      summary: 'List installed packages',
      querystring: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { kind } = request.query as { kind?: string };
    const service = app.marketplace;
    const entries = await app.observability.observeOperation(
      'marketplace.list',
      () => service.list(kind ? { kind: kind as EntityKind } : undefined),
    );
    return reply.send({ entries, total: entries.length });
  });
}
