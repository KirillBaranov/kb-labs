import '../types.js';
import type { FastifyInstance } from 'fastify';

export function installRoute(app: FastifyInstance): void {
  app.post('/install', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Install package(s)',
      body: {
        type: 'object',
        required: ['specs'],
        properties: {
          specs: { type: 'array', items: { type: 'string' } },
          dev: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { specs, dev } = request.body as { specs: string[]; dev?: boolean };
    const service = app.marketplace;
    const result = await app.observability.observeOperation('marketplace.install', () => service.install(specs, { dev }));
    return reply.send(result);
  });
}
