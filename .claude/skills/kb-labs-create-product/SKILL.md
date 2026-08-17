---
name: kb-labs-create-product
description: Use when the user wants to create a new KB Labs product or service (HTTP API, daemon, background worker) that runs under kb-dev. Do not use for creating plugins (use kb-labs-create-plugin) or for adding routes to an existing service.
user-invocable: true
argument-hint: [service-name]
---

# Create a KB Labs Product / Service

Help the user create a new platform service that follows the canonical bootstrap,
health/readiness, observability, and logging conventions.

## Step 1: Clarify the service intent

Before scaffolding, confirm:

- **Service name** — kebab-case (e.g. `audit`, `notifier`).
- **Kind** — HTTP API (Fastify), background daemon, or worker.
- **Port** — must not collide with existing services in `.kb/devservices.yaml`.
- **Dependencies** — does it need Redis, qdrant, state-daemon, gateway?

## Step 2: Pick the closest reference service

Do not invent a layout. Copy the structure of the closest reference:

- HTTP API → look at how `marketplace-api` or `workflow-daemon` is organised
- bootstrap-style platform service → look at `rest-api`
- router/proxy style → look at `gateway`
- small daemon with HTTP surface → look at `core-state-daemon`

These services live under the `platform/` and `infra/` directories of a kb-labs
workspace. If the user is in a downstream consumer project (not the platform
monorepo), copy from `templates/kb-labs-product-template` instead.

## Step 3: Required outcomes

A compliant service must expose:

- `/health` — cheap health snapshot
- `/ready` — readiness for orchestration
- `/observability/describe` — versioned identity and capabilities
- `/observability/health` — structured runtime diagnostics
- `/metrics` — canonical Prometheus output

It must use:

- `@kb-labs/core-platform` types (`ILogger`, `ICache`, etc.) — never local copies
- `@kb-labs/shared-http` for `registerOpenAPI()` and HTTP helpers
- `HttpObservabilityCollector` from shared-http for metrics and operations
- structured log correlation fields (`serviceId`, `instanceId`, `requestId`,
  `traceId`, `operation`, normalized `route`)

## Step 4: Wire bootstrap

```ts
import Fastify from 'fastify';
import { registerOpenAPI } from '@kb-labs/shared-http';
import { initPlatform } from '@kb-labs/core-runtime';

const platform = await initPlatform();
const server = Fastify({ logger: platform.logger });

await registerOpenAPI(server, {
  title: 'My Service',
  version: '0.1.0',
  servers: [{ url: 'http://localhost:5099', description: 'Local dev' }],
  ui: process.env.NODE_ENV !== 'production',
});

// ...register routes...

await server.listen({ port: 5099, host: '0.0.0.0' });
```

Routes that should appear in OpenAPI need a `tags:` entry on their schema.
Routes without `tags:` are hidden — this is the visibility model.

## Step 5: Register the service with kb-dev

Add an entry to `.kb/devservices.yaml` so the service can be started/stopped/
restarted via the unified manager:

```json
{
  "services": {
    "my-service": {
      "group": "backend",
      "port": 5099,
      "command": "node ./apps/my-service/dist/index.js",
      "healthUrl": "http://localhost:5099/health",
      "dependsOn": ["state-daemon"]
    }
  }
}
```

Then:

```bash
pnpm kb-dev start my-service
pnpm kb-dev status
```

## Step 6: Tests

At minimum, add tests that verify:

- `/health` returns OK
- `/ready` returns ready
- `/observability/describe` validates against the canonical contract
- `/observability/health` validates against the canonical contract
- `/metrics` includes the canonical metric families

Use validators from `@kb-labs/core-contracts` if available:

- `validateServiceObservabilityDescribe(...)`
- `validateServiceObservabilityHealth(...)`
- `checkCanonicalObservabilityMetrics(...)`

## Step 7: Compliance check

```bash
pnpm --filter <service-package> build
pnpm --filter <service-package> test
pnpm kb-dev restart my-service
pnpm kb-dev ready my-service --timeout 60s
pnpm kb-dev health
```

## Definition of done

- Service starts and stops cleanly via `kb-dev`
- Canonical endpoints respond with valid payloads
- Metrics include the canonical families
- Logs carry correlation fields
- Tests pass
- No legacy observability surface left behind

## Do not

- Do not invent a per-service observability format
- Do not duplicate platform types — always import from `@kb-labs/core-*`
- Do not run the service via raw `node` or `pnpm *:dev` — always go through `kb-dev`
- Do not commit secrets or hard-coded ports outside `.kb/devservices.yaml`
