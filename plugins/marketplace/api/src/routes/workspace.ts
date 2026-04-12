/**
 * @module @kb-labs/marketplace-api/routes/workspace
 * Workspace-level operations (not tied to a specific package).
 *
 * POST /workspace/sync — scan workspace and populate lock
 */

import '../types.js';
import type { FastifyInstance } from 'fastify';

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  // POST /workspace/sync — scan for plugins/adapters and populate lock
  app.post('/workspace/sync', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Sync workspace — scan for plugins/adapters and populate lock',
      body: {
        type: 'object',
        required: ['include'],
        properties: {
          include: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns to scan (relative to workspace root)',
          },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Patterns to skip',
          },
          autoEnable: {
            type: 'boolean',
            description: 'Auto-enable newly discovered entries (default: false)',
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      include: string[];
      exclude?: string[];
      autoEnable?: boolean;
    };
    const result = await app.observability.observeOperation(
      'marketplace.sync',
      () => app.marketplace.sync(body),
    );
    return reply.send(result);
  });
}
