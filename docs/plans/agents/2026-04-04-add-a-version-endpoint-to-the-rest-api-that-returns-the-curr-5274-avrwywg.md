# Plan: Add `/version` Endpoint to the REST API
## Table of Contents
- [Task](#task)
- [Context](#context)
- [Steps](#steps)
  - [Phase 1 — Contract (`rest-api-contracts`)](#phase-1-—-contract-rest-api-contracts)
  - [Phase 2 — Route handler (`rest-api-app`)](#phase-2-—-route-handler-rest-api-app)
  - [Phase 3 — Tests](#phase-3-—-tests)
- [Risks](#risks)
- [Verification](#verification)
- [Summary of Changed Files](#summary-of-changed-files)
- [Execution Log](#execution-log)
## Task

**From →** The REST API (`platform/kb-labs-rest-api`) has no `/version` endpoint.

**To →** A new `GET /api/v1/version` endpoint exists, returns a JSON response with the app version read from `apps/rest-api/package.json`, following the same `SuccessEnvelope` pattern used by `/ping` and `/hello`.

---

## Context

The REST API is a Fastify application with a layered architecture:

- **`platform/kb-labs-rest-api/packages/rest-api-contracts/src/`** — shared TypeScript interfaces/types for request/response shapes. Every endpoint has a corresponding contract file (e.g. `ping.ts`, `hello.ts`).
- **`platform/kb-labs-rest-api/apps/rest-api/src/routes/`** — Fastify route registration functions (e.g. `ping.ts`, `hello.ts`).
- **`platform/kb-labs-rest-api/apps/rest-api/src/routes/index.ts`** — master registration module that calls all `register*Routes()` functions (e.g. `registerPingRoutes` at line 259).
- **`platform/kb-labs-rest-api/packages/rest-api-contracts/src/index.ts`** — barrel re-export for all contracts.

The app's authoritative `version` field lives in **`platform/kb-labs-rest-api/apps/rest-api/package.json`** (`"version": "0.1.0"`).

The pattern for a lightweight diagnostic endpoint (identical to `/ping`):
1. Define a payload interface and response type in `rest-api-contracts`.
2. Add a route file in `apps/rest-api/src/routes/`.
3. Register it in `apps/rest-api/src/routes/index.ts`.
4. Export the contract from the contracts barrel.
5. Write a unit test mirroring `ping.spec.ts`.

---

## Steps

### Phase 1 — Contract (`rest-api-contracts`)

**Step 1.1 — Create `platform/kb-labs-rest-api/packages/rest-api-contracts/src/version.ts`**

Define the payload interface and response type. This mirrors the shape of `ping.ts` in the same directory (which itself defines `PingPayload` and `PingResponse`):

```ts
import type { SuccessEnvelope } from './envelopes';

export interface VersionPayload {
  schema: 'kb.version/1';
  version: string;  // semver string from package.json, e.g. "0.1.0"
}

export type VersionResponse = SuccessEnvelope<VersionPayload>;
```

**Step 1.2 — Append export to `platform/kb-labs-rest-api/packages/rest-api-contracts/src/index.ts`**

The barrel file currently has 12 lines. Add one line at the end:

```ts
export * from './version';
```

---

### Phase 2 — Route handler (`rest-api-app`)

**Step 2.1 — Create `platform/kb-labs-rest-api/apps/rest-api/src/routes/version.ts`**

Read `package.json` once at module-load time (zero async I/O per request). The file follows the same structure as `ping.ts` and `hello.ts` exactly:

```ts
/**
 * @module @kb-labs/rest-api-app/routes/version
 * Version endpoint — returns the app version from package.json
 */
import { createRequire } from 'module';
import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { VersionResponse } from '@kb-labs/rest-api-contracts';
import { normalizeBasePath } from '../utils/path-helpers';

// ESM-safe JSON load (project uses "type": "module")
const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export async function registerVersionRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  fastify.get(`${basePath}/version`, async (request, reply) => {
    const start = Date.now();
    const response: VersionResponse = {
      ok: true,
      data: { schema: 'kb.version/1', version: version ?? 'unknown' },
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

> **Why `createRequire`?** The app's `package.json` has `"type": "module"`, so native `require()` is not available. `createRequire(import.meta.url)` is the standard Node.js ESM-safe way to load a JSON file. The path `../../package.json` resolves relative to the compiled output in `dist/routes/version.js` → `dist/package.json` (or the source file's location during `tsx watch`).

**Step 2.2 — Edit `platform/kb-labs-rest-api/apps/rest-api/src/routes/index.ts`**

Add the import alongside the other route imports (near line 20, after the `registerPingRoutes` import):

```ts
import { registerVersionRoutes } from './version';
```

Then add the registration call in the `registerRoutes` function body, directly after `registerPingRoutes` (currently at line 259):

```ts
await registerVersionRoutes(server, config);
```

---

### Phase 3 — Tests

**Step 3.1 — Create `platform/kb-labs-rest-api/apps/rest-api/src/routes/__tests__/version.spec.ts`**

Mirror `ping.spec.ts` (the template test, 64 lines). Covers: correct path returns 200 with proper payload, `basePath` is respected, wrong path returns 404.

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerVersionRoutes } from '../version';

const BASE_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: 'test',
  cors: { origins: [], allowCredentials: true, profile: 'dev' },
  plugins: [],
  mockMode: false,
};

describe('GET /version', () => {
  it('returns 200 with version payload', async () => {
    const app = Fastify({ logger: false });
    await registerVersionRoutes(app, BASE_CONFIG);

    const res = await app.inject({ method: 'GET', url: '/api/v1/version' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.schema).toBe('kb.version/1');
    expect(typeof body.data.version).toBe('string');
    expect(body.data.version.length).toBeGreaterThan(0);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.durationMs).toBe('number');

    await app.close();
  });

  it('works without basePath (empty string)', async () => {
    const app = Fastify({ logger: false });
    await registerVersionRoutes(app, { ...BASE_CONFIG, basePath: '' });

    const res = await app.inject({ method: 'GET', url: '/version' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    await app.close();
  });

  it('returns 404 for wrong path', async () => {
    const app = Fastify({ logger: false });
    await registerVersionRoutes(app, BASE_CONFIG);

    const res = await app.inject({ method: 'GET', url: '/version' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **ESM JSON import path mismatch** — `../../package.json` resolves differently in `dist/` vs `src/` during dev | Double-check the relative path from `dist/routes/version.js`; if it drifts, use `new URL('../../package.json', import.meta.url)` with `fs.readFileSync` instead |
| **`version` is `undefined` at runtime** if the build strips `package.json` | The fallback `version ?? 'unknown'` prevents the endpoint from crashing |
| **Build order** — `rest-api-contracts` must be built before `rest-api-app` | The existing `pnpm -r run build` respects workspace dependency order; contracts are already listed as `workspace:*` in the app's deps |

---

## Verification

```sh
# 1. Build the contracts package so the new VersionResponse type is available
pnpm --filter @kb-labs/rest-api-contracts build

# 2. Type-check the app (catches import errors and type mismatches)
pnpm --filter @kb-labs/rest-api-app type-check

# 3. Run the app's test suite (includes the new version.spec.ts)
pnpm --filter @kb-labs/rest-api-app test

# 4. Smoke-test against the live dev server (run `pnpm rest:dev` in a separate terminal first)
curl -s http://localhost:3000/api/v1/version | jq .
# Expected output:
# { "ok": true, "data": { "schema": "kb.version/1", "version": "0.1.0" }, "meta": { ... } }

# 5. Run the full rest-api workspace test to catch any regressions
pnpm --filter @kb-labs/rest-api test
```

---

## Summary of Changed Files

| File | Action |
|------|--------|
| `platform/kb-labs-rest-api/packages/rest-api-contracts/src/version.ts` | **Create** — `VersionPayload` interface + `VersionResponse` type |
| `platform/kb-labs-rest-api/packages/rest-api-contracts/src/index.ts` | **Edit** — append `export * from './version'` |
| `platform/kb-labs-rest-api/apps/rest-api/src/routes/version.ts` | **Create** — Fastify route handler |
| `platform/kb-labs-rest-api/apps/rest-api/src/routes/index.ts` | **Edit** — import + register `registerVersionRoutes` after line 259 |
| `platform/kb-labs-rest-api/apps/rest-api/src/routes/__tests__/version.spec.ts` | **Create** — unit tests |

---

This plan is ready for user approval.

## Execution Log

- 2026-04-04T11:56:08.753Z: Plan approved via CLI (--approve).
