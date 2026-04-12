# ADR-0010: HTTP API Design Conventions

**Date:** 2026-04-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-12
**Tags:** api, rest, conventions, services

## Context

KB Labs has multiple HTTP services (rest-api :5050, marketplace :5070, workflow :7778, gateway :4000). As the platform grows, inconsistent API design creates friction: verbs in URLs (RPC-style), operations split across too many files, no shared naming rules. Studio consumes these APIs directly, so inconsistency compounds on the frontend side too.

We needed a clear, enforceable rule set that covers URL structure, HTTP method semantics, file layout, and when it's acceptable to deviate from REST into RPC-style actions.

## Decision

### 1. REST is the default

All HTTP APIs use resource-oriented REST as the baseline. URLs are **nouns**, HTTP methods are **verbs**.

```
GET    /plugins          → list all
GET    /plugins/:id      → get one
POST   /plugins          → create (install)
PATCH  /plugins/:id      → partial update (rename, change config)
DELETE /plugins/:id      → delete (uninstall)
```

Rules:
- URLs use **kebab-case**, plural nouns: `/workflow-runs`, `/api-keys`
- No verbs in URL segments: ~~`/install`~~, ~~`/getPlugin`~~, ~~`/list`~~
- `:id` is always the resource identifier — never encode the action in the id

### 2. Sub-actions for commands that don't fit CRUD

When an operation cannot be expressed as a state change on a resource (enable = `PATCH { enabled: true }`), use a sub-action:

```
POST /plugins/:id/sync     → trigger sync (not a state change)
POST /plugins/:id/link     → link to local path (side effect beyond the resource)
POST /runs/:id/cancel      → cancel a running job
POST /runs/:id/retry       → retry a failed run
```

Rules:
- Sub-actions are **always `POST`**
- Sub-action segment is a **verb** (the only place verbs are allowed)
- Sub-actions that are reversible may use `DELETE`: `DELETE /plugins/:id/link`
- Never nest deeper than `/resource/:id/action` — no `/a/:id/b/:id/c`

### 3. State changes via PATCH, not sub-actions

Simple boolean/enum state changes belong on the resource, not as separate actions:

```
# Wrong
POST /plugins/:id/enable
POST /plugins/:id/disable

# Right
PATCH /plugins/:id   body: { enabled: true }
```

### 4. File layout: one file per resource

Group routes by **resource**, not by operation. Each file owns all HTTP methods for one resource or a closely related group.

```
routes/
  plugins.ts         ← GET /plugins, GET /plugins/:id, POST, PATCH, DELETE
  plugins.sync.ts    ← POST /plugins/:id/sync, DELETE /plugins/:id/link  (if complex enough to split)
  diagnostics.ts     ← GET /diagnostics (service-level, not a resource)
  index.ts           ← registers all route files, no business logic
```

Rules:
- File name = resource name in kebab-case, singular or plural matching the URL
- Split a file only when it exceeds ~150 lines or mixes unrelated concerns
- `index.ts` only calls `registerXRoutes(app)` — no route definitions inside
- Test file lives next to the route file: `plugins.spec.ts`

### 5. Response shape

All responses follow the envelope set by `shared-http`:

```jsonc
// Success
{ "ok": true, "data": { ... }, "meta": { "requestId": "...", "durationMs": 12 } }

// Error
{ "ok": false, "error": { "code": "PLUGIN_NOT_FOUND", "message": "..." }, "meta": { ... } }
```

HTTP status codes must be meaningful:
- `200` — success with body
- `201` — resource created (include `Location` header)
- `204` — success, no body (DELETE)
- `400` — bad input (validation error)
- `404` — resource not found
- `409` — conflict (already installed, duplicate)
- `422` — input valid but business rule rejected it
- `503` — dependency unavailable (qdrant down, etc.)

### 6. OpenAPI tags = visibility toggle

Routes **without `tags`** are hidden from `/openapi.json` and `/docs`. This is the only mechanism needed — no separate `internal` flag.

```ts
// Public — appears in OpenAPI
app.get('/plugins', { schema: { tags: ['plugins'], ... } }, handler)

// Internal — hidden from OpenAPI
app.get('/plugins/registry-snapshot', handler)
```

## Consequences

### Positive

- Predictable API across all services — Studio doesn't need per-service docs to consume endpoints
- New service authors have a clear template to follow
- OpenAPI specs are meaningful (only tagged routes appear)
- Easier to onboard contributors

### Negative

- Existing endpoints in rest-api, marketplace, workflow need migration (non-trivial)
- Some actions genuinely don't fit neatly — requires judgment call each time

### Alternatives Considered

- **Pure RPC everywhere** — rejected, too much documentation overhead, HTTP semantics wasted
- **Full HATEOAS** — rejected, overkill for a developer tool platform
- **GraphQL** — rejected, REST is simpler for Studio's use case and easier to expose publicly

## Implementation

1. Apply to marketplace first (smallest, cleanest starting point)
2. Then workflow daemon API
3. Then rest-api (largest, most complex — do incrementally)
4. Update `shared-http` if any shared utilities need to reflect these conventions
5. A Claude Code skill (`/new-service-route`) guides route creation interactively

## References

- [Google Cloud API Design Guide](https://cloud.google.com/apis/design)
- [ADR-0002: Plugins and Extensibility](./0002-plugins-and-extensibility.md)

---

**Last Updated:** 2026-04-12
**Next Review:** after marketplace migration is complete
