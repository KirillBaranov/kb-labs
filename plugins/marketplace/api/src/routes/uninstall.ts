import '../types.js';
import type { FastifyInstance } from 'fastify';

export function uninstallRoute(app: FastifyInstance): void {
  app.post('/uninstall', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Uninstall package(s)',
      body: {
        type: 'object',
        required: ['packageIds'],
        properties: {
          packageIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (request, reply) => {
    const { packageIds } = request.body as { packageIds: string[] };
    const service = app.marketplace;
    await app.observability.observeOperation('marketplace.uninstall', () => service.uninstall(packageIds));
    return reply.send({ ok: true, removed: packageIds });
  });
}
