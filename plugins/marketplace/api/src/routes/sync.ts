import '../types.js';
import type { FastifyInstance } from 'fastify';

export function syncRoute(app: FastifyInstance): void {
  app.post('/sync', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Sync workspace — scan for plugins/adapters and populate lock',
      body: {
        type: 'object',
        required: ['include'],
        properties: {
          include: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to scan (relative to workspace root)' },
          exclude: { type: 'array', items: { type: 'string' }, description: 'Optional patterns to skip' },
          autoEnable: { type: 'boolean', description: 'Enable new entries (default: false, safe for prod)' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      include: string[];
      exclude?: string[];
      autoEnable?: boolean;
    };
    const result = await app.observability.observeOperation('marketplace.sync', () => app.marketplace.sync(body));
    return reply.send(result);
  });
}
