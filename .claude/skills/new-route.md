---
name: new-route
description: Guide for adding a new route or HTTP service following KB Labs API conventions (ADR-0010)
globs:
  - "plugins/*/api/**"
  - "plugins/*/daemon/**"
  - "shared/http/**"
---

# Adding a New Route or HTTP Service

Follow ADR-0010 for all HTTP API work. Reference: `docs/adr/0010-http-api-design-conventions.md`

## Decision tree: REST or RPC?

**Use REST** (resource + HTTP method) when the operation is CRUD on a resource:
- Create → `POST /resources`
- Read → `GET /resources` or `GET /resources/:id`
- Update → `PATCH /resources/:id`  
- Delete → `DELETE /resources/:id` (respond `204`, no body)

**Use sub-action** (POST to a verb sub-resource) when:
- The operation is a command with side effects beyond the resource state
- The operation cannot be expressed as a simple state change
- Examples: `/resources/:id/sync`, `/runs/:id/cancel`, `/plugins/:id/link`

**Never** put verbs in the main URL segment: ~~`/install`~~, ~~`/syncPlugin`~~, ~~`/getList`~~

State changes (enable/disable, activate/deactivate) are `PATCH` on the resource body, not sub-actions:
```ts
PATCH /plugins/:id   body: { enabled: true }   // correct
POST  /plugins/:id/enable                       // wrong
```

## URL rules

- Plural nouns: `/plugins`, `/workflow-runs`, `/api-keys`
- kebab-case: `/workflow-runs`, not `/workflowRuns`
- `:id` only for resource identifier — never encode the action there
- Max nesting: `/resource/:id/action` — no deeper

## File layout: one file per resource

```
routes/
  plugins.ts          ← all methods for /plugins and /plugins/:id
  plugins.sync.ts     ← only if the action file exceeds ~150 lines
  diagnostics.ts      ← service-level endpoints (/health, /diagnostics)
  index.ts            ← only calls registerXRoutes(app), no route definitions
```

Name files after the resource, not the operation. `plugins.ts`, not `install.ts`.

### Exception: plugin manifest `rest.routes`

Plugins without their own daemon register routes via the manifest `rest.routes` array.
Each entry points to a handler file loaded dynamically by the rest-api runtime.
In this case **one file per operation is required** — it's the plugin contract, not a style choice.

```ts
// manifest.ts
rest: {
  basePath: '/plugins/my-plugin',
  routes: [
    { method: 'GET',  path: '/items',     handler: './rest/items-list.js#default' },
    { method: 'POST', path: '/items',     handler: './rest/items-create.js#default' },
    { method: 'GET',  path: '/items/:id', handler: './rest/item-detail.js#default' },
  ],
}
```

```
rest/
  items-list.js       ← GET /items
  items-create.js     ← POST /items
  item-detail.js      ← GET /items/:id
```

These handlers use `defineHandler` from `@kb-labs/sdk`, not Fastify directly.
Apply REST URL conventions (plural nouns, sub-actions for commands) — the one-file-per-op layout is the only difference.

## Route template

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function registerPluginsRoutes(app: FastifyInstance): Promise<void> {
  // GET /plugins — list
  app.get('/plugins', {
    schema: {
      tags: ['plugins'],                        // required for OpenAPI visibility
      summary: 'List installed plugins',
      response: { 200: zodToJsonSchema(PluginsListSchema) },
    },
  }, async (_req, reply) => {
    const plugins = await app.marketplace.listPlugins();
    reply.send(plugins);
  });

  // GET /plugins/:id — get one
  app.get('/plugins/:id', {
    schema: {
      tags: ['plugins'],
      summary: 'Get plugin by id',
      params: zodToJsonSchema(z.object({ id: z.string() })),
      response: { 200: zodToJsonSchema(PluginSchema), 404: {} },
    },
  }, async (req, reply) => {
    const plugin = await app.marketplace.getPlugin(req.params.id);
    if (!plugin) return reply.code(404).send();
    reply.send(plugin);
  });

  // POST /plugins — install (create)
  app.post('/plugins', {
    schema: {
      tags: ['plugins'],
      summary: 'Install a plugin',
      body: zodToJsonSchema(InstallBodySchema),
      response: { 201: zodToJsonSchema(PluginSchema), 409: {} },
    },
  }, async (req, reply) => {
    const plugin = await app.marketplace.install(req.body);
    reply.code(201).header('Location', `/plugins/${plugin.id}`).send(plugin);
  });

  // PATCH /plugins/:id — update state or config
  app.patch('/plugins/:id', {
    schema: {
      tags: ['plugins'],
      summary: 'Update plugin state or config',
      params: zodToJsonSchema(z.object({ id: z.string() })),
      body: zodToJsonSchema(PluginPatchSchema),
      response: { 200: zodToJsonSchema(PluginSchema), 404: {} },
    },
  }, async (req, reply) => {
    const plugin = await app.marketplace.update(req.params.id, req.body);
    if (!plugin) return reply.code(404).send();
    reply.send(plugin);
  });

  // DELETE /plugins/:id — uninstall
  app.delete('/plugins/:id', {
    schema: {
      tags: ['plugins'],
      summary: 'Uninstall a plugin',
      params: zodToJsonSchema(z.object({ id: z.string() })),
      response: { 204: {}, 404: {} },
    },
  }, async (req, reply) => {
    const ok = await app.marketplace.uninstall(req.params.id);
    if (!ok) return reply.code(404).send();
    reply.code(204).send();
  });

  // POST /plugins/:id/sync — sub-action (command, not CRUD)
  app.post('/plugins/:id/sync', {
    schema: {
      tags: ['plugins'],
      summary: 'Sync plugin with registry',
      params: zodToJsonSchema(z.object({ id: z.string() })),
      response: { 200: {}, 404: {} },
    },
  }, async (req, reply) => {
    const ok = await app.marketplace.sync(req.params.id);
    if (!ok) return reply.code(404).send();
    reply.send({ synced: true });
  });
}
```

## HTTP status codes

| Situation | Code |
|-----------|------|
| Success with body | `200` |
| Resource created | `201` + `Location` header |
| Success, no body (DELETE) | `204` |
| Validation failed | `400` |
| Not found | `404` |
| Already exists / conflict | `409` |
| Valid input, rejected by business rule | `422` |
| Dependency down (qdrant, redis) | `503` |

## OpenAPI visibility

Routes **without `tags`** are hidden from `/openapi.json` — use this for internal endpoints.
Routes **with `tags`** appear in the spec and `/docs` UI.

```ts
// Public
app.get('/plugins', { schema: { tags: ['plugins'], ... } }, handler)

// Internal — no tags, hidden from spec
app.get('/_internal/registry-snapshot', handler)
```

## Registering a new route file

In `routes/index.ts`:
```ts
import { registerPluginsRoutes } from './plugins.js';
import { registerDiagnosticsRoutes } from './diagnostics.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerPluginsRoutes(app);
  await registerDiagnosticsRoutes(app);
}
```

`index.ts` contains **only** `registerXRoutes()` calls — no route definitions.

## Checklist before finishing

- [ ] URL uses plural noun, no verbs, kebab-case
- [ ] HTTP method matches the operation (CRUD → method, command → POST sub-action)
- [ ] Status codes are correct (201 on create, 204 on delete)
- [ ] `tags` set for public routes, omitted for internal
- [ ] Response schema defined (enables serialization + OpenAPI)
- [ ] Route registered in `routes/index.ts`
- [ ] File named after the resource, not the operation
