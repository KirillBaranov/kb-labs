/**
 * @module @kb-labs/marketplace-api/routes/packages
 * REST routes for marketplace packages (plugins, adapters, etc.)
 *
 * GET    /packages              — list installed packages
 * POST   /packages              — install package(s)
 * DELETE /packages              — uninstall package(s)
 * PATCH  /packages/:id          — update state (enabled/disabled)
 * POST   /packages/:id/update   — update to latest version
 * POST   /packages/:id/link     — link local path for development
 * DELETE /packages/:id/link     — unlink
 */

import '../types.js';
import type { FastifyInstance } from 'fastify';
import type { EntityKind } from '@kb-labs/core-discovery';

export function registerPackagesRoutes(app: FastifyInstance): void {
  // GET /packages — list installed packages
  app.get('/packages', {
    schema: {
      tags: ['Marketplace'],
      summary: 'List installed packages',
      querystring: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'Filter by entity kind (plugin, adapter, …)' },
        },
      },
    },
  }, async (request, reply) => {
    const { kind } = request.query as { kind?: string };
    const entries = await app.observability.observeOperation(
      'marketplace.list',
      () => app.marketplace.list(kind ? { kind: kind as EntityKind } : undefined),
    );
    return reply.send({ entries, total: entries.length });
  });

  // POST /packages — install one or more packages
  app.post('/packages', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Install package(s)',
      body: {
        type: 'object',
        required: ['specs'],
        properties: {
          specs: { type: 'array', items: { type: 'string' }, description: 'Package specs (name, name@version, etc.)' },
          dev: { type: 'boolean', description: 'Install as dev dependency' },
        },
      },
    },
  }, async (request, reply) => {
    const { specs, dev } = request.body as { specs: string[]; dev?: boolean };
    const result = await app.observability.observeOperation(
      'marketplace.install',
      () => app.marketplace.install(specs, { dev }),
    );
    return reply.code(201).send(result);
  });

  // DELETE /packages — uninstall one or more packages
  app.delete('/packages', {
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
    await app.observability.observeOperation(
      'marketplace.uninstall',
      () => app.marketplace.uninstall(packageIds),
    );
    return reply.code(204).send();
  });

  // PATCH /packages/:id — update package state (enable/disable)
  app.patch('/packages/:id', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Update package state (enable or disable)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { enabled } = request.body as { enabled: boolean };
    const operation = enabled ? 'marketplace.enable' : 'marketplace.disable';
    const method = enabled
      ? () => app.marketplace.enable(id)
      : () => app.marketplace.disable(id);
    await app.observability.observeOperation(operation, method);
    return reply.send({ id, enabled });
  });

  // POST /packages/:id/update — update package to latest version
  app.post('/packages/:id/update', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Update package to latest version',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await app.observability.observeOperation(
      'marketplace.update',
      () => app.marketplace.update([id]),
    );
    return reply.send(result);
  });

  // POST /packages/:id/link — link a local path for development
  app.post('/packages/:id/link', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Link a local package path for development',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Absolute path to local package' },
        },
      },
    },
  }, async (request, reply) => {
    const { path } = request.body as { path: string };
    const result = await app.observability.observeOperation(
      'marketplace.link',
      () => app.marketplace.link(path),
    );
    return reply.send(result);
  });

  // DELETE /packages/:id/link — unlink a local package
  app.delete('/packages/:id/link', {
    schema: {
      tags: ['Marketplace'],
      summary: 'Unlink a local package',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await app.observability.observeOperation(
      'marketplace.unlink',
      () => app.marketplace.unlink(id),
    );
    return reply.code(204).send();
  });
}
