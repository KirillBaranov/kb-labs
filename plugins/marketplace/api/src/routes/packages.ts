/**
 * @module @kb-labs/marketplace-api/routes/packages
 * REST routes for marketplace packages (plugins, adapters, etc.)
 *
 * Every mutating route accepts `{ scope, projectRoot? }` in its body.
 * `GET /packages` accepts the same pair in its query. Default scope is
 * `platform` — CLI clients always pass the explicit scope. Project scope
 * additionally requires an absolute `projectRoot` (validated by
 * `parseMutatingScope` / `parseQueryScope`).
 *
 * GET    /packages              — list installed packages (supports scope=all)
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
import {
  parseMutatingScope,
  parseQueryScope,
  queryScopeBodySchemaFragment,
  scopeBodySchemaFragment,
} from '../scope-parser.js';

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
          ...queryScopeBodySchemaFragment,
        },
      },
    },
  }, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const ctx = parseQueryScope(query);
    const kind = typeof query.kind === 'string' ? (query.kind as EntityKind) : undefined;
    const entries = await app.observability.observeOperation(
      'marketplace.list',
      () => app.marketplace.list(ctx, kind ? { kind } : undefined),
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
          ...scopeBodySchemaFragment,
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as { specs: string[]; dev?: boolean } & Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    const result = await app.observability.observeOperation(
      'marketplace.install',
      () => app.marketplace.install(ctx, body.specs, { dev: body.dev }),
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
          ...scopeBodySchemaFragment,
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as { packageIds: string[] } & Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    await app.observability.observeOperation(
      'marketplace.uninstall',
      () => app.marketplace.uninstall(ctx, body.packageIds),
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
          ...scopeBodySchemaFragment,
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { enabled: boolean } & Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    const operation = body.enabled ? 'marketplace.enable' : 'marketplace.disable';
    const method = body.enabled
      ? () => app.marketplace.enable(ctx, id)
      : () => app.marketplace.disable(ctx, id);
    await app.observability.observeOperation(operation, method);
    return reply.send({ id, enabled: body.enabled, scope: ctx.scope });
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
      body: {
        type: 'object',
        properties: scopeBodySchemaFragment,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    const result = await app.observability.observeOperation(
      'marketplace.update',
      () => app.marketplace.update(ctx, [id]),
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
          ...scopeBodySchemaFragment,
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as { path: string } & Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    const result = await app.observability.observeOperation(
      'marketplace.link',
      () => app.marketplace.link(ctx, body.path),
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
      body: {
        type: 'object',
        properties: scopeBodySchemaFragment,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ctx = parseMutatingScope(body);
    await app.observability.observeOperation(
      'marketplace.unlink',
      () => app.marketplace.unlink(ctx, id),
    );
    return reply.code(204).send();
  });
}
