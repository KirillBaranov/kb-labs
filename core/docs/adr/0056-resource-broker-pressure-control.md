# ADR-0056: ResourceBroker Pressure Control (tryAcquire + registerLimit)

**Date:** 2026-05-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-25
**Tags:** [resource-broker, rate-limiting, http, gateway, pressure-control]

## Context

`IResourceBroker` (`core/resource-broker/src/types.ts`) currently supports a single pattern: **queue + execute**. The caller invokes `register(resource, { executor, rateLimits })` and then `enqueue(request)`; the broker waits for rate-limit capacity, runs the executor with retries, and resolves a `ResourceResponse`. This is correct for LLM, embeddings, and vector store calls — long, unpredictable, asynchronous work where queueing is the natural fit.

Designing the webhook intake for the platform exposed the opposite need. HTTP endpoints — webhooks, public API routes, gateway-fronted services — must make an immediate decision: accept the request and forward it, or reject with `429 Too Many Requests` plus a `Retry-After` hint. Queueing an inbound HTTP request and holding the socket while we wait for capacity is the wrong shape: it inverts backpressure, hides load from clients, and exhausts file descriptors under burst.

We need a second pattern on the same broker: **check + reject**. Same rate-limit primitives, same per-resource statistics, no executor, no queue.

## Decision

Extend `IResourceBroker` with two additive methods. No existing behavior changes; no existing callers are touched.

```ts
export interface TryAcquireOptions {
  /** Estimated tokens. Default 0 (HTTP endpoints typically don't consume tokens). */
  tokens?: number;
}

export interface TryAcquireResult extends AcquireResult {
  /**
   * Release the reserved slot. Idempotent. No-op when allowed=false.
   * Caller MUST invoke this in a `finally` block when allowed=true.
   */
  release: () => Promise<void>;
}

export interface IResourceBroker {
  // existing: register, enqueue, getStats, shutdown, isShuttingDown

  /** Register a resource for limit-only usage. No executor, no queue. */
  registerLimit(resource: string, rateLimits: RateLimitConfig | string): void;

  /** Atomically check & reserve capacity. Does not queue, does not wait. */
  tryAcquire(resource: string, opts?: TryAcquireOptions): Promise<TryAcquireResult>;
}
```

Semantics:

- `registerLimit` reuses `register` internally with a sentinel executor that throws if invoked, and sets an internal `limitOnly` flag on the resource registration.
- `enqueue` on a `limitOnly` resource resolves with `{ success: false, error: <limit-only> }` — the same shape used today for "not registered" (`resource-broker.ts:135`). It does **not** throw.
- `tryAcquire` on an unregistered resource throws synchronously. This is a programming error, not a rate-limit decision, and deserves a different signal from `{ allowed: false }`.
- `tryAcquire` after `shutdown()` returns `{ allowed: false, release: noop }` — never throws, so middleware can safely run during drain.
- `release` is returned as a closure captured per acquisition. Idempotent via an internal `released` flag. When `allowed=false`, `release` is a no-op so callers can use `try { ... } finally { result.release() }` unconditionally.

### Why `release` is a handle, not a public method

A free-standing `release(resource)` on the broker can't be bound to a specific acquisition. Callers can over-release, double-release, or release for the wrong resource. A handle:

- ties release to the acquisition that owns it,
- is naturally idempotent,
- composes with `try / finally`,
- forward-compatible with `Symbol.asyncDispose` once we move to ES2024.

## Alternatives rejected

1. **A separate `IRateLimiter` next to the broker.** Duplicates the backend, splits statistics, and forces the gateway to keep two rate-limit configs in sync. Rejected.
2. **Public `release(resource)` method on the broker.** Easy to misuse; can't enforce one-release-per-acquire. Rejected in favor of handle-based release.
3. **Synchronous `tryAcquire`.** The backend is async (`StateBrokerRateLimitBackend` speaks HTTP to the State daemon). Forcing sync would either block the event loop or restrict the broker to in-memory backends. Rejected.
4. **Reuse `enqueue` with a `skipQueue: true` flag.** Conflates two patterns inside one method. The queue path has retry semantics, executor wiring, and a `ResourceResponse` shape that don't apply to check+reject. Rejected.

## Consequences

**Positive**
- Webhook intake and any future HTTP endpoint share one primitive for pressure control. One config surface, one stats endpoint.
- Backends (in-memory, StateBroker) are unchanged — `tryAcquire` is a thin orchestration over the existing `acquire` / `release` contract.
- Statistics (`getStats`) cover both patterns uniformly.

**Neutral / to watch**
- `getStats` for limit-only resources will report zeros in queue-related fields (`queueSize`, `queueByPriority`). Dashboards must distinguish queued vs limit-only resources to avoid misleading "empty queue" signals. Capture this in observability docs when the gateway integration lands.

**Negative**
- Two patterns on one interface increases surface area. Mitigated by clear naming (`register` / `registerLimit`, `enqueue` / `tryAcquire`) and ADR-level documentation of when to use which.

## Rollout

**Gateway only. Downstream services (rest-api, workflow, marketplace) do not change.**

The gateway (`plugins/gateway`, port `:4000`) is the mandatory entry point for any HTTP-facing platform service (per `CLAUDE.md`: "Services with HTTP require gateway plugin"). All inbound HTTP traffic flows through it. Applying `tryAcquire` per service would:

- duplicate responsibility,
- prevent fleet-wide limits under multi-instance deployments,
- push the `429 Retry-After` decision past the point where it makes sense to send it.

The intended shape (follow-up ticket — not this one):

```yaml
# plugins/gateway config
pressure:
  - resource: webhook:github
    route: POST /webhooks/github
    limits: { requestsPerSecond: 50, maxConcurrentRequests: 100 }
  - resource: webhook:stripe
    route: POST /webhooks/stripe
    limits: { requestsPerSecond: 20 }
```

```ts
// gateway middleware
const r = await broker.tryAcquire(matchedResource);
if (!r.allowed) {
  return reply
    .status(429)
    .header('Retry-After', Math.ceil((r.waitTimeMs ?? 1000) / 1000))
    .send();
}
try {
  await forwardToDownstream(req);
} finally {
  await r.release();
}
```

Services downstream of the gateway require no changes. A service may still call `tryAcquire` directly for non-HTTP paths (WS, internal consumers) — the API is universal.

## Next steps

1. **Follow-up ticket — gateway integration.** Add `pressure` config section, startup wiring (`broker.registerLimit` per route), middleware. Acceptance includes a real HTTP e2e: `e2e/gateway/specs/...` — start gateway via `kb-dev start` with a test config of `requestsPerSecond: 5`, fire 20 `POST /webhooks/test` calls, expect exactly 5 `200` and 15 `429` with `Retry-After`. Wait > 1s, repeat, expect 5 more `200`.
2. **`Symbol.asyncDispose` on `TryAcquireResult`.** Add when the build target moves to ES2024 across the monorepo.
3. **Observability docs.** Note that limit-only resources surface zeros in queue stats so dashboards don't read them as "queue healthy".
