# ADR-0024: Port Allocation Policy

**Date:** 2026-06-03
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-06-03
**Tags:** tooling, deployment, process

## Context

Ports across KB Labs were declared in multiple uncoordinated places — `.kb/devservices.yaml`
and `.kb/devservices.dev.yaml` (runtime), `infra/docker-compose.backend.yml` (prod containers),
`.github/workflows/deploy.yml` (smoke tests), and hardcoded constants in service source. There
was no single source of truth, no naming convention for which numeric range a service belongs to,
and no automated check that these layers agree.

This caused a concrete, recurring production incident: the deploy smoke test polled
`http://localhost:5070/health` (the marketplace daemon's dev port) while the deployed service was
`kb-marketplace-registry` listening on `5071` — and that container had no `ports:` mapping in
docker-compose at all. The smoke test could never pass, so **every merge to main triggered a
rollback** for 6+ consecutive deploys, regardless of what the PR actually changed.

We need: a documented range scheme with clear ownership criteria, a single registry, an
auto-generated glossary, and CI enforcement that blocks the mismatch class of bugs before merge.

## Decision

### Range scheme

Six numeric ranges, each with a one-question membership test:

| Range | Ports | Membership criterion |
|-------|-------|----------------------|
| `frontend` | 3000–3999 | End consumer is a browser; sits behind nginx in prod |
| `gateway` | 4000–4099 | Routes external traffic; the single external entry point |
| `test` | 4100–4999 | Exists only in CI/e2e; never in production |
| `services` | 5000–5999 | Primary interface is an HTTP API with business logic |
| `daemons` | 7000–7999 | Background process; HTTP is auxiliary (health/management) |
| `infra` | 9000–9999 | Third-party dependency (Redis, MinIO, Qdrant) we connect to |

Decision tree for a new service:

```
Serves HTML to browsers?         → frontend  (3000)
Routes external traffic?         → gateway   (4000)
CI/e2e environment only?         → test      (4100)
Third-party infrastructure?      → infra     (9000)
HTTP is auxiliary (health/mgmt)? → daemons   (7000)
Otherwise                        → services  (5000)
```

Vendor-fixed ports that cannot move (e.g. Qdrant 6333, Redis 6379) are recorded as explicit
`exceptions` in the registry, each with a reason.

### Sources of truth

- **`.kb/devservices.yaml` / `.kb/devservices.dev.yaml`** remain the runtime truth — what
  `kb-dev` actually starts and on which port. Unchanged in role.
- **`infra/port-registry.yaml`** is new: it defines the ranges, their criteria, the exceptions,
  and the **production deployment contract** (`prod:` — which services deploy, on which port, in
  which container, with which smoke path).
- **`docs/ports.md`** is a generated glossary — never hand-edited.

### Enforcement

`scripts/checks/check-ports.mjs` runs in CI via devkit `custom_checks` (anchored to
`@kb-labs/devkit` so it executes exactly once). All findings are errors:

| Code | Catches |
|------|---------|
| `UNKNOWN_RANGE` | A runtime port outside every range and not an exception |
| `DUPLICATE_PORT` | Two services claiming the same port |
| `DEVSERVICES_PORT_DISAGREE` | Same service name with different ports across the two devservices files |
| `PROD_NO_COMPOSE_PORT` | A prod service with no matching `ports:` map in docker-compose |
| `PROD_CONTAINER_MISMATCH` | Registry `container` ≠ docker-compose `container_name` (rollback would target a nonexistent container) |
| `PROD_NO_SMOKE_TEST` | A prod service with no smoke test in deploy.yml |
| `PROD_PORT_MISMATCH` | A smoke-test port that matches no prod service in the registry |
| `PROD_SMOKE_PATH_MISMATCH` | A smoke test on the right port but the wrong path |
| `STALE_PORTS_DOC` | `docs/ports.md` drifted from the registry (run `pnpm ports:generate`) |

`PROD_PORT_MISMATCH` + `PROD_NO_COMPOSE_PORT` are exactly the two faults behind the original
smoke-test incident; `PROD_CONTAINER_MISMATCH` covers the sibling rollback-name fault (a failed
deploy that silently never rolls back because the rollback targets a container name that does not
exist). All three are now structurally impossible to merge.

Prod entries link to their dev-runtime counterpart via `runtime_service`, so scope attribution
and cross-checks key off identity, never a coincidentally shared port number.

## Consequences

### Positive

- The deploy mismatch class of bug is caught at PR time, not after merge.
- One documented place to answer "what's the default port for X" and "which range does my new
  service belong to".
- Duplicate ports are detected automatically.
- The glossary stays accurate by construction (staleness is a CI error).

### Negative

- Adding a prod-deployed service now requires three coordinated edits (devservices, registry
  `prod:`, docker-compose) — but that coordination is exactly what was missing.
- One more CI check to keep green.

### Alternatives Considered

- **Annotate ports inside each `manifest.ts`** and scan them. Rejected for now: requires a
  `ManifestV3` schema change and the daemon manifests already live in a separate `kb.service/1`
  schema — a central registry is simpler and covers non-plugin infra (Redis, MinIO) too.
- **Embed ranges directly in `devservices.yaml`.** Rejected: that file is load-bearing for
  `kb-dev` runtime; keeping policy metadata in a separate `port-registry.yaml` avoids coupling.

## Implementation

- `infra/port-registry.yaml` — ranges, criteria, exceptions, prod contract.
- `scripts/lib/ports.mjs` — shared parsing + glossary renderer.
- `scripts/checks/check-ports.mjs` — the six validations (TypedCheckOutput v2).
- `scripts/generate-ports-doc.mjs` — writes `docs/ports.md`.
- `docs/ports.md` — generated glossary (committed).
- `devkit.yaml` — `check-ports` added to `custom_checks`.
- `package.json` — `ports:generate` and `ports:check` scripts.
- Deploy fix: `infra/docker-compose.backend.yml` adds `ports: ["5071:5071"]`;
  `.github/workflows/deploy.yml` smoke test + rollback corrected from 5070 to 5071.

**Workflow for adding a service:** assign a port in `devservices*.yaml` within the right range →
if it deploys to prod, add it to `prod:` in `port-registry.yaml` and a `ports:` map in
docker-compose → run `pnpm ports:generate` → commit.

## References

- [docs/ports.md](../ports.md) — generated glossary
- [infra/port-registry.yaml](../../infra/port-registry.yaml)
- [ADR-0020: Single External Port](./0020-single-external-port.md)
- [ADR-0022: Service Transport Abstraction](./0022-service-transport-abstraction.md)

---

**Last Updated:** 2026-06-03
