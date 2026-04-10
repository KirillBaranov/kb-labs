# Plan: Add a Simple Health Check Endpoint to the REST API Service
## Table of Contents
- [Task](#task)
- [Context](#context)
- [Steps](#steps)
  - [Phase 1: Add the contract type](#phase-1-add-the-contract-type)
  - [Phase 2: Create the route handler](#phase-2-create-the-route-handler)
  - [Phase 3: Register the route](#phase-3-register-the-route)
  - [Phase 4: Add a test](#phase-4-add-a-test)
- [Risks](#risks)
- [Verification](#verification)
- [Approval](#approval)
- [Execution Log](#execution-log)
## Task

**A → B:**  
- **A (current state):** The API has a complex `GET /health` endpoint (`routes/health.ts`) that calls `registry.getSystemHealth()`, evaluates plugin mount state, publishes SSE events, integrates Prometheus metrics, and caches results — it is designed for deep observability, not a fast liveness probe. There is also a `routes/hello.ts` file with a lightweight `GET /hello` route, but it is **never registered** in `routes/index.ts` and thus unreachable.  
- **B (target state):** A new `GET /ping` endpoint that responds immediately with `{ ok: true, status: "ok", ts: "<iso>" }` and HTTP 200 — no registry calls, no plugin state, no async work. Suitable for use as a load-balancer liveness probe or uptime check. The existing `/health` and `/ready` routes remain untouched.

---

## Context

The codebase follows a consistent pattern:
- **Route handlers** live in `platform/kb-labs-rest-api/apps/rest-api/src/routes/` as `registerXRoutes(fastify, config)` functions.
- **Shared types** live in `platform/kb-labs-rest-api/packages/rest-api-contracts/src/` and are re-exported through `index.ts`.
- **Routes are wired** in `platform/kb-labs-rest-api/apps/rest-api/src/routes/index.ts` inside `registerRoutes()`.
- **Tests** use Vitest + `fastify.inject()` with a bare `Fastify({ logger: false })` instance, mirroring `routes/__tests__/health.spec.ts`.
- The `hello.ts` route already demonstrates the minimal-handler pattern this plan follows — we model `ping` after it, keeping the endpoint truly dependency-free.

---

## Steps

### Phase 1: Add the contract type

**File:** `platform/kb-labs-rest-api/packages/rest-api-contracts/src/ping.ts` *(new file)*

The contracts package is the single source of truth for shared response shapes. Adding a `PingResponse` type here follows the same convention as `hello.ts:1–15`, which defines `HelloPayload` + `HelloResponse = SuccessEnvelope<HelloPayload>`.

```ts
// ping.ts
import type { SuccessEnvelope } from './envelopes';

export interface PingPayload {
  schema: 'kb.ping/1';
  status: 'ok';
  ts: string;
}

export type PingResponse = SuccessEnvelope<PingPayload>;
```

**File:** `platform/kb-labs-rest-api/packages/rest-api-contracts/src/index.ts`

Add `export * from './ping';` after line 7 (the last existing export), alongside the existing exports for `hello`, `system`, `ready`, etc.

---

### Phase 2: Create the route handler

**File:** `platform/kb-labs-rest-api/apps/rest-api/src/routes/ping.ts` *(new file)*

This is the core change. The route makes no async calls — it returns a fixed payload immediately, identical in structure to `hello.ts:28–46`. The `basePath` handling (e.g. `/api/v1`) is resolved via `normalizeBasePath` from `utils/path-helpers.ts`, which is already imported by every other route file.

```ts
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { PingResponse } from '@kb-labs/rest-api-contracts';
import { normalizeBasePath } from '../utils/path-helpers';

export async function registerPingRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  fastify.get(`${basePath}/ping`, async (request, reply) => {
    const start = Date.now();
    const response: PingResponse = {
      ok: true,
      data: { schema: 'kb.ping/1', status: 'ok', ts: new Date().toISOString() },
      meta: {
        requestId: request.id as string,
        durationMs: Date.now() - start,
        apiVersion: '1.0.0',
      },
    };
    return reply.code(200).send(response);
  });
}
```

---

### Phase 3: Register the route

**File:** `platform/kb-labs-rest-api/apps/rest-api/src/routes/index.ts`

Two small edits:

1. **Add the import** after the import for `registerHealthRoutes` (currently at line 19), alongside the other route imports:
   ```ts
   import { registerPingRoutes } from './ping';
   ```

2. **Call the registrar** inside `registerRoutes()`, immediately after the `await registerHealthRoutes(...)` call at line 256, so it boots alongside the other infrastructure endpoints before any plugin-mount complexity:
   ```ts
   await registerPingRoutes(server, config);
   ```

This is exactly how every other route in the file works — `registerHealthRoutes`, `registerOpenAPIRoutes`, etc. all follow the same two-step pattern.

---

### Phase 4: Add a test

**File:** `platform/kb-labs-rest-api/apps/rest-api/src/routes/__tests__/ping.spec.ts` *(new file)*

Modelled after `health.spec.ts:71–141`, which directly imports the register function and uses `fastify.inject()`. No mocks are needed because `registerPingRoutes` has zero external dependencies.

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerPingRoutes } from '../ping';

const BASE_CONFIG: RestApiConfig = {
  port: 3000, basePath: '/api/v1', apiVersion: 'test',
  cors: { origins: [], allowCredentials: true, profile: 'dev' },
  plugins: [], mockMode: false,
};

describe('GET /ping', () => {
  it('returns 200 with ok payload', async () => {
    const app = Fastify({ logger: false });
    await registerPingRoutes(app, BASE_CONFIG);

    const res = await app.inject({ method: 'GET', url: '/api/v1/ping' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.schema).toBe('kb.ping/1');
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.ts).toBe('string');
    await app.close();
  });

  it('works without basePath', async () => {
    const app = Fastify({ logger: false });
    await registerPingRoutes(app, { ...BASE_CONFIG, basePath: '' });

    const res = await app.inject({ method: 'GET', url: '/ping' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `/ping` conflicts with an existing route | Low | Searched all `*.ts` files — no existing `/ping` registration found |
| `@kb-labs/rest-api-contracts` build cache stale | Low | Build step listed in Verification runs contracts first |
| `normalizeBasePath` already defined locally in `index.ts` | Known — safe | The new `ping.ts` imports from `utils/path-helpers.ts` (the canonical source); no collision |

---

## Verification

Build the contracts package first (it now exports the new `PingResponse` type):
```
pnpm --filter @kb-labs/rest-api-contracts build
```

Type-check the app (catches import or type errors in the new `ping.ts` and the updated `index.ts`):
```
pnpm --filter @kb-labs/rest-api-app type-check
```

Run the full test suite for the REST API app (includes the new `ping.spec.ts`):
```
pnpm --filter @kb-labs/rest-api-app test
```

Manual smoke test once the server is running (default config uses `basePath: /api/v1`):
```
curl -s http://localhost:3000/api/v1/ping | jq .
```

Expected response:
```json
{
  "ok": true,
  "data": { "schema": "kb.ping/1", "status": "ok", "ts": "2025-01-01T00:00:00.000Z" },
  "meta": { "requestId": "...", "durationMs": 0, "apiVersion": "1.0.0" }
}
```

---

## Approval

This plan is ready for user approval. All four changes are purely additive — no existing routes, types, or tests are modified. The new endpoint (`GET /ping`) is intentionally dependency-free to serve as a reliable liveness probe alongside the existing deep-health `/health` and readiness `/ready` endpoints.

## Execution Log

- 2026-04-04T10:57:32.702Z: Plan approved via CLI (--approve).
