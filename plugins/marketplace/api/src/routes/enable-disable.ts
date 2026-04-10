import '../types.js';
import type { FastifyInstance } from 'fastify';

export function enableDisableRoute(app: FastifyInstance): void {
  app.post('/enable', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Enable a package',
      body: {
        type: 'object',
        required: ['packageId'],
        properties: {
          packageId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { packageId } = request.body as { packageId: string };
    const service = app.marketplace;
    await app.observability.observeOperation('marketplace.enable', () => service.enable(packageId));
    return reply.send({ ok: true, packageId, enabled: true });
  });

  app.post('/disable', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Disable a package',
      body: {
        type: 'object',
        required: ['packageId'],
        properties: {
          packageId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { packageId } = request.body as { packageId: string };
    const service = app.marketplace;
    await app.observability.observeOperation('marketplace.disable', () => service.disable(packageId));
    return reply.send({ ok: true, packageId, enabled: false });
  });
}
