# Port Glossary

> **Auto-generated. Do not edit manually.** Run `pnpm ports:generate` to update.
> Source: `infra/port-registry.yaml` + `.kb/devservices*.yaml`. Policy: [ADR-0024](./adr/0024-port-allocation-policy.md).

## Decision Tree

Use this to pick the range for a new service:

```
Serves HTML to browsers?         → frontend  (3000–3999)
Routes external traffic?         → gateway   (4000–4099)
CI/e2e environment only?         → test      (4100–4999)
Third-party infrastructure?      → infra     (9000–9999)
HTTP is auxiliary (health/mgmt)? → daemons   (7000–7999)
Otherwise                        → services  (5000–5999)
```

## Port Ranges

| Range | Ports | Description | Criteria |
|-------|-------|-------------|----------|
| `frontend` | 3000–3999 | UI/frontend services served directly to browsers | End consumer is a browser, not another service. Sits behind nginx in production (80/443). No backend business logic. |
| `gateway` | 4000–4099 | API gateways — single entry point for all external traffic | Routes external traffic to other services; contains no business logic itself. Exposed to the outside world (ports: in compose). Remove it and external requests stop. |
| `test` | 4100–4999 | Test infrastructure — CI/e2e only, never in production | Only exists in CI or e2e environments. Not listed in the primary devservices.yaml. |
| `services` | 5000–5999 | Application HTTP services with business logic | Primary interface is an HTTP API (REST/GraphQL). Contains business logic. Can be dev-only or prod. |
| `daemons` | 7000–7999 | Internal background daemons — HTTP is auxiliary only | Primary work is background processing (state, events, orchestration). HTTP exists only for health checks or management. Removing HTTP does not stop core work. |
| `infra` | 9000–9999 | External infrastructure dependencies — third-party services | Third-party service (Redis, MinIO, Qdrant, etc.). KB Labs code connects to it; we do not own it. |

## Runtime Services

Ports declared in `.kb/devservices.yaml` / `.kb/devservices.dev.yaml`.

| Port | Service | Range | Scope | Group | Description |
|------|---------|-------|-------|-------|-------------|
| 3000 | Studio Web App | `frontend` | dev | backend | Web UI for KB Labs platform |
| 4000 | Gateway | `gateway` | prod | backend | Central router — aggregates REST API, Workflow, Marketplace |
| 5050 | REST API | `services` | dev | backend | Main platform REST API |
| 5070 | Marketplace Service | `services` | dev | backend | Unified entity marketplace — install, manage, discover |
| 6379 | Redis Cache | `exception` | dev | infra | State cache + workflow distributed lock backing store |
| 7777 | State Daemon | `daemons` | dev | infra | Distributed state management |
| 7778 | Workflow Daemon | `daemons` | dev | backend | Workflow engine REST API |

## Exceptions

Ports intentionally outside the ranges (vendor-fixed defaults).

| Port | Service | Reason |
|------|---------|--------|
| 6333 | qdrant | Qdrant vendor-fixed default port (infra, dev-only) |
| 6379 | redis | Redis vendor-fixed default port (infra, dev-only) |
| 20128 | omniroute | OmniRoute vendor-fixed default port (ai, optional, dev-only) |

## Production Deployment

Services deployed to production (validated against docker-compose + deploy smoke tests).

| Port | Service | Container | Smoke path |
|------|---------|-----------|------------|
| 3000 | kb-web | `kb-labs-web` | `/` |
| 3001 | kb-docs | `kb-labs-docs` | `/` |
| 4000 | kb-gateway | `kb-gateway` | `/health` |
| 5071 | kb-marketplace-registry | `kb-marketplace-registry` | `/health` |

