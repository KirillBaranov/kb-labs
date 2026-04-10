import '../types.js';
import type { FastifyInstance } from 'fastify';

export function linkUnlinkRoute(app: FastifyInstance): void {
  app.post('/link', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Link a local package for development',
      body: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { path } = request.body as { path: string };
    const service = app.marketplace;
    const result = await app.observability.observeOperation('marketplace.link', () => service.link(path));
    return reply.send({ ok: true, ...result });
  });

  app.post('/unlink', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Unlink a package',
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
    await app.observability.observeOperation('marketplace.unlink', () => service.unlink(packageId));
    return reply.send({ ok: true, packageId });
  });
}
