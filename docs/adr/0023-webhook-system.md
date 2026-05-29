# ADR-0023: Webhook Delivery System

**Date:** 2026-05-29
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-29
**Tags:** architecture, gateway, webhooks, plugins, security, idempotency

## Context

External SaaS products (GitHub, Slack, Stripe, Linear, etc.) push events into
user workspaces via HTTP webhooks. KB Labs had no first-class model for this:
plugins that wanted to receive webhooks either opened their own HTTP ports or
registered routes directly in the gateway without any auth, idempotency, or
rate-limiting guarantees.

This created several problems:

1. **Auth was ad-hoc or absent.** Each plugin author was responsible for
   verifying HMAC signatures or shared secrets, with no shared infrastructure
   and no enforcement that verification was present at all.

2. **Routes were not discoverable.** There was no registry of which plugins
   accepted webhooks, what event types they handled, or what secrets were
   provisioned — making rotation, auditing, and CLI introspection impossible.

3. **No idempotency.** Webhook providers often deliver the same event more
   than once (retries, at-least-once guarantees). Without deduplication, plugin
   handlers could process the same event multiple times with visible side effects.

4. **Plugin code ran in-process in gateway.** Early prototypes called plugin
   handler functions directly inside the gateway process, violating the
   plugin isolation boundary established by the platform's execution model.

5. **No async delivery.** Long-running handlers blocked the HTTP response,
   causing provider timeouts and retry storms.

The design goal was a **manifest-driven, gateway-owned webhook system** that:
handles auth, idempotency, and rate limiting uniformly; dispatches to plugin
handlers through the existing execution boundary; and provides a CLI and admin
API for secret lifecycle management.

## Decision

### Manifest declaration

Plugins declare webhook endpoints in `ManifestV3.webhooks.handlers` as
`WebhookHandlerDecl` entries. The gateway scans all discovered manifests at
startup (via `createRegistry()`) and auto-registers the corresponding routes.
There is no programmatic registration API — configuration lives in the manifest.

Each declaration carries:

```typescript
interface WebhookHandlerDecl {
  event: string;         // route segment: /webhooks/{pluginId}/{event}
  auth: WebhookAuthDecl; // REQUIRED — startup error if absent
  multi?: boolean;       // adds /{instanceId} suffix for per-instance secrets
  async?: boolean;       // respond 202 immediately, dispatch in background
  challenge?: string;    // challenge param name for Slack-style URL verification
  idempotencyKey?: string; // dot-path into body for delivery ID extraction
}
```

Missing `auth` on any declaration is a **startup error**, not a silent
passthrough. This prevents accidental exposure of unauthenticated endpoints.

### Separate Fastify scope for delivery

Webhook delivery routes (`/webhooks/*`) are registered in a dedicated Fastify
scope that **bypasses both gateway auth middlewares** (session JWT verification
and machine-token verification). This is intentional: providers do not present
KB Labs credentials — they present their own signature. The webhook scope runs
its own auth pipeline instead.

The admin API (`POST /api/v1/webhooks/provision`, `GET /api/v1/webhooks`,
`DELETE /api/v1/webhooks/:pluginId/:event[/:instanceId]`) lives inside the
standard `gatewayRoutes` scope and requires normal auth.

### Three auth types

| Type | Mechanism |
|------|-----------|
| `secret` | Compare header value to stored secret using `crypto.timingSafeEqual`. Constant-time comparison prevents timing oracle attacks. |
| `hmac` | Compute HMAC-SHA256 over the raw request body using the stored secret and compare to provider-supplied signature header. Uses `timingSafeEqual`. |
| `custom` | Invoke a named validator handler via `backend.execute`. Plugin supplies its own verification logic. |

Secrets are stored in the cache adapter (`ICache`) under a namespaced key. In
development this is the in-memory cache; in production, Redis. This means
secrets survive gateway restarts as long as the cache does, but there is no
separate persistent secret store — see Consequences.

### Secret rotation with grace window

Provisioning a new secret stores both `current` and `previous` fields. The
`previous` secret is accepted for a 24-hour grace window, allowing operators to
rotate secrets without a hard cutover. After 24 hours, only the current secret
is valid.

`onProvision` is an optional handler name in the declaration; when present, the
gateway calls it (via `backend.execute`) after generating a new secret, allowing
the plugin to react (e.g. update a provider subscription via API call).

### Idempotency before auth

Idempotency key extraction and `cache.setIfNotExists` deduplication runs
**before** auth verification. This is a deliberate tradeoff: a provider-assigned
delivery ID in the request body is controlled by the provider, not by an
authenticated caller. Deduplicating on it before auth means a spoofed request
with a replayed delivery ID will be dropped without executing the handler — but
the handler may also miss a legitimate delivery that shares the same ID as an
earlier spoofed request.

This tradeoff is accepted because:
- Delivery IDs are long random strings; collision by an attacker requires
  knowing a future legitimate delivery ID.
- The alternative (auth before idempotency) means the dedup key must be carried
  in a header signed by the provider, which most providers do not support.
- A failed auth attempt still returns 401 after idempotency check, so the
  duplicate suppression window is the only observable risk surface.

TTL for dedup entries is 7 days — matching typical provider retry windows.

### Async delivery

When `async: true`, the gateway responds `202 Accepted` immediately and
dispatches the handler call via `globalDispatcher` in the background. This
prevents provider retry storms from long-running handlers and matches the
expected contract (most providers treat any 2xx as success and do not inspect
the body).

Synchronous delivery (the default) returns the handler's response body and
status code directly.

### Challenge / URL verification

When `challenge` is set to a query parameter name, incoming requests that carry
that query parameter are treated as URL verification probes (Slack's
`challenge` handshake, GitHub's ping event equivalents). The gateway echoes the
parameter value back with `200 OK` **before** running auth or calling any
handler. This allows platforms to verify the endpoint at subscription time.

### Rate limiting via ResourceBroker

Per-webhook rate limiting is enforced through `IResourceBroker.registerLimit`
and `tryAcquire`, consistent with ADR-0056 (resource governance). Each
`{pluginId}/{event}` pair gets an independent limit bucket. Exceeding the limit
returns `429 Too Many Requests` before any auth or handler execution.

This reuses the existing governance layer rather than introducing a parallel
rate-limiting mechanism in the webhook subsystem.

### Plugin isolation: execution boundary preserved

Plugin handler code **never runs in-process inside the gateway**. All handler
dispatch goes through:

```
globalDispatcher.call(namespaceId, hostId, 'execution', 'execute', payload)
```

This is the same boundary used for all other plugin execution. The webhook
router is a thin orchestration layer in the gateway — it owns auth, idempotency,
rate limiting, and async dispatch, then hands off to the existing execution
infrastructure.

The `HostContext` type system is extended with `host: 'webhook'` so handlers
can inspect their invocation context.

### CLI and admin API

Secret lifecycle is exposed via:
- **Admin API** (REST, requires auth): provision, list, revoke
- **CLI**: `kb webhook provision <pluginId> <event> [--instance <id>]`,
  `kb webhook list [--plugin <id>]`, `kb webhook revoke <pluginId> <event>`

CLI commands are registered as system commands (not plugin commands), because
secret management is a platform concern that must be available regardless of
which plugins are installed.

## Alternatives Considered

### Plugin-owned webhook registration (programmatic API)

Plugins could call `platform.webhooks.register(...)` at boot time to declare
handlers. Rejected because it requires the plugin process to be running for the
route to exist, makes the webhook surface non-discoverable without starting all
plugins, and couples route lifetime to plugin process lifetime.

Manifest-driven registration means the gateway knows all webhooks at startup,
even for plugins that are not currently executing.

### Separate webhook service (not gateway-owned)

A standalone webhook relay service would decouple webhook ingestion from the
gateway. Rejected for the initial implementation because:
- It adds an additional network hop and operational surface.
- The gateway already owns auth middleware, the plugin execution boundary, and
  the resource broker — co-locating webhook logic avoids duplicating these.
- The `IServiceTransport` abstraction (ADR-0022) makes the gateway extensible
  enough; a separate relay can be introduced if throughput demands it.

### Auth optional (opt-in, not enforced)

Some frameworks allow unauthenticated webhooks as a starting point. Rejected.
Any public endpoint receiving arbitrary HTTP payloads must have auth enforced
at the infrastructure level. Making auth opt-in means a plugin author forgetting
to set it creates a permanently unauthenticated endpoint. Startup failure on
missing auth is the only safe default.

### Persistent secret store (dedicated DB table)

Secrets could live in a dedicated `webhook_secrets` table rather than in the
cache. Rejected for this iteration because:
- The cache adapter already has a well-tested interface and a Redis backend in
  production.
- Adding a DB dependency for webhooks would require schema migrations, a new
  repository, and a new adapter entry — significant scope for what is essentially
  a key-value store with TTL.
- The tradeoff is documented: if the cache is flushed, secrets must be
  re-provisioned. This is acceptable because provisioning is a CLI command and
  secrets are operator-controlled.

### Idempotency after auth

Running idempotency check after auth is strictly safer (a spoofed delivery ID
cannot suppress a future legitimate delivery). Rejected because most providers
do not sign idempotency keys, and moving the check post-auth would require every
provider integration to include the delivery ID in the signed payload or header —
a constraint we cannot impose on third-party providers.

### Per-webhook separate Fastify instances

Isolating each plugin's webhook routes in separate Fastify instances (one per
plugin) would improve blast-radius isolation. Rejected as over-engineering:
the execution boundary (globalDispatcher) already provides isolation. The
gateway scope separation (delivery scope vs. auth scope) is sufficient at this
stage.

## Consequences

**Good:**
- Plugin authors declare webhook endpoints in the manifest — no boilerplate auth
  code, no missed verification.
- Secret rotation, listing, and revocation are CLI-first operations; no manual
  cache key manipulation.
- Auth enforcement is a startup gate — misconfigured plugins fail early, not at
  runtime.
- Async delivery eliminates provider retry storms from slow handlers.
- Idempotency dedup is transparent to plugin handlers; they can assume
  at-most-once delivery within the 7-day window.
- Rate limiting is free because plugins already participate in the resource
  broker model.

**Neutral:**
- Idempotency-before-auth is a documented tradeoff, not a bug. Teams that
  require stricter ordering can implement it in a `custom` auth validator.
- `multi: true` instances require the caller (CLI or admin API consumer) to
  manage instance IDs; the gateway has no opinion on what constitutes a valid
  instance ID.

**Breaking / Operational:**
- Secrets live in the cache. A full cache flush (e.g. Redis `FLUSHALL`) requires
  re-provisioning all webhook secrets. Operators must account for this in
  incident runbooks.
- Gateway startup fails if any manifest declares a webhook handler without an
  `auth` field. Existing plugins that attempted to register raw routes must
  migrate to the manifest format.

## Implementation

| Package | Change |
|---|---|
| `plugins/gateway/app` | `webhook/secret-store.ts` — `ICache`-backed secret store with rotation |
| `plugins/gateway/app` | `webhook/idempotency-store.ts` — `cache.setIfNotExists` with 7-day TTL |
| `plugins/gateway/app` | `webhook/auth.ts` — `secret`, `hmac`, `custom` verifiers; `timingSafeEqual` |
| `plugins/gateway/app` | `webhook/router.ts` — separate Fastify scope, manifest scanning, rate limit calls |
| `plugins/gateway/app` | `webhook/provision.ts` — secret generation, rotation, `onProvision` dispatch |
| `plugins/gateway/app` | `webhook/admin-routes.ts` — provision / list / revoke REST endpoints |
| `cli/commands` | `commands/system/webhook/webhook-provision.ts` |
| `cli/commands` | `commands/system/webhook/webhook-list.ts` |
| `cli/commands` | `commands/system/webhook/webhook-revoke.ts` |
| `core/plugin-contracts` | `WebhookHandlerDecl`, `WebhookAuthDecl` types; `ManifestV3.webhooks` field |
| `core/plugin-contracts` | `host: 'webhook'` in `HostContext` discriminated union |
| `shared/command-kit` | `webhook()` builder for CLI command construction |

## References

- ADR-0002: Plugins and Extensibility
- ADR-0020: Identity & Authentication (gateway auth scope, machine tokens)
- ADR-0021: Plugin Services / Platform Boundary (execution isolation model)
- ADR-0022: Service Transport Abstraction (gateway scope architecture)
- ADR-0056: Resource Governance (ResourceBroker, `registerLimit`, `tryAcquire`)
- [feat/webhook-system branch] — Phases 1–8 implementation
