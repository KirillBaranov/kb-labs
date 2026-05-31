# @kb-labs/core-policy-runtime

> Runtime authorization engine (RBAC + ReBAC) behind the platform Policy Decision Point.

Implements `IPolicyDecisionPoint` from `@kb-labs/core-contracts`. Combines:

- **RBAC** — group → permission mapping with group inheritance (multi-parent, cycle-safe), multiple groups per user.
- **ReBAC** — relation tuples (`owner`, `member`, …) → permission grants, resolved per resource.

Decision: `allow = RBAC(action) OR ReBAC(action, resource)`. **Default deny** (closed world).
`type: 'agent'` is **fail-closed** (denied) until constrained delegation lands (ClickUp 869def338).

The engine is **pure**: all I/O goes through injected reader ports (`IGroupReader`, `IRelationReader`).
A generic document-backed implementation (`createDocumentBackedPolicy`) wires the engine to any
`IDocumentDatabase`; the write/seed path lives with the gateway, sharing collection schema via
`collections.ts`.

> Not to be confused with `@kb-labs/core-policy` (workspace-level YAML policy for CLI/release gates).

See ADR-0020 and the PDP-as-platform-adapter ADR.
