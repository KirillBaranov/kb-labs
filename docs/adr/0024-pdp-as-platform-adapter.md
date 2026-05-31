# ADR-0024: Policy Decision Point as a platform adapter (RBAC + ReBAC)

**Date:** 2026-05-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-30
**Tags:** architecture, security, authorization, rbac, rebac, platform
**Supersedes (in part):** ADR-0020 principle #2 (re: PDP placement only)
**Implements:** [ClickUp epic 869def338](https://app.clickup.com/t/869def338)

## Context

ADR-0020 landed identity & authentication for Studio cloud and shipped a **stub**
`IPolicyDecisionPoint` (hard-coded `tenant-admin` → all / `tenant-member` → none).
It also declared (principle #2) that "UserStore, TokenIssuer, Membership, **PDP** —
internal to the gateway. Anything else is a fork, not an adapter."

This epic replaces the stub with a real RBAC + ReBAC engine. During design we decided
the authorization layer must be consumable not only by the gateway but by workflow,
REST, and (later) plugins — "one source of truth for who-can-do-what." Keeping the PDP
gateway-internal would force every other consumer to re-implement or import gateway
internals. So we promote the PDP to a **first-class platform adapter** (`platform.policy`),
governed and IPC-proxied like `cache`/`storage`. This is a deliberate, scoped reversal of
ADR-0020 principle #2 **for the PDP only** — UserStore/TokenIssuer/Membership remain
gateway-internal.

Authorization model decision (see the design discussion
`docs/plans/2026-05-26-platform-authorization-design.md`): **RBAC + ReBAC, not ABAC**.
ABAC's attribute-resolution I/O, non-enumerability, and cognitive cost are not justified
by current needs; ReBAC (relationship tuples) covers ownership/membership cases. ABAC is
deferred until a concrete attribute-based requirement appears.

## Decision

### Principles (binding)

1. **PDP is a platform adapter.** `platform.policy: IPolicyDecisionPoint`. One registry
   entry in `core/plugin-runtime` declares its treatment: governed for plugins (Axis A),
   IPC-proxied to the parent. Supersedes ADR-0020 #2 for the PDP.

2. **Single instance; derived default.** The PDP is not loaded from a config adapter
   package — it is **composed from `documentDatabase`**. The runtime loader builds it once
   as a platform default (`@kb-labs/core-policy-runtime` `createDocumentBackedPolicy`) and
   provides it via the existing `setAdapter` seam. No bespoke pipeline primitive. The
   gateway **consumes** `platform.policy` for its routes and uses stores only to **seed**
   the same `documentDatabase` — seeds and decisions never diverge.

3. **Engine is pure (Cedar-style).** `core/policy-runtime` depends only on
   `core/contracts`; all I/O goes through injected reader ports (`IGroupReader`,
   `IRelationReader`). Persistence (the four `policy_*` collections) lives with the
   gateway; engine and stores agree on schema via shared collection constants.

4. **Model: RBAC OR ReBAC.** `allow = RBAC(action) OR ReBAC(action, resource)`.
   RBAC = groups (multi-membership, multi-parent inheritance, cycle-safe) → permissions.
   ReBAC = relation tuples (`owner`, `member`, …) → permission grants per resource type.
   **Default deny (closed world).** No `action ∈ enum` guard in the engine — RBAC matches
   group-permission DATA, ReBAC matches relation-grant CONFIG, so plugin-defined permission
   strings flow unimpeded.

5. **Tokens stay identity-only (ADR-0020 #3 holds).** `type: 'agent'` is added to the
   `Identity` contract for forthcoming constrained delegation, but the engine
   **fail-closes** on agents (`reason: 'agent_delegation_not_implemented'`) until that epic
   lands — an agent is never silently treated as a full user.

6. **Identity ⇒ active.** The PDP does not check `User.status`; ADR-0020 CD-1 guarantees
   the gateway middleware only mints an `Identity` for active users. Future consumers must
   obtain `Identity` from validated context.

7. **No cache yet; invalidation seam reserved.** The PDP resolves the Subject fresh on
   every `check` (a group/relation change takes effect immediately — ADR-0020 #5). A future
   caching layer plugs into the reserved `invalidate(userId?)` hook without changing the
   construction signature.

8. **`enumeratePermissions` is RBAC-only; `listResources` is ReBAC-scoped.** Per-resource
   ReBAC access is not enumerable without a resource, so a UI combines the two. `machine`
   identities are decided by an injected `machinePolicy` (default deny); the engine never
   hard-codes machine behaviour.

### Surface

- Contracts (`core/contracts`): `Identity` (+`'agent'`), `Resource`, `ResourceRef`,
  `Relation`, `Subject`, `PolicyContext`, `PolicyDecision`, `IPolicyDecisionPoint`
  (`check` + `enumeratePermissions` + `listResources`).
- Engine (`core/policy-runtime`): RBAC + ReBAC + combined PDP, reader ports, document-backed
  readers, `createDocumentBackedPolicy`, `policy_*` collection constants.
- Layer-0: `IPluginAdapters.policy?`, `ADAPTER_DEFAULTS.policy` (noop, no factory — like
  `snapshotManager`), `ADAPTER_REGISTRY.policy` (`wrapPolicy` + `PolicyProxy`), loader
  derives the instance from `documentDatabase`.
- Gateway: seed stores (`policy_memberships`, `policy_groups`, `policy_group_permissions`,
  `policy_relations`) + `ensurePolicyBootstrap` (tenant-admin → all, tenant-member → none).
  Consumes `platform.policy`; the former stub is `@deprecated`.

## Consequences

### Positive
- One authorization seam reusable by gateway, workflow, REST, and plugins.
- Engine is unit-testable in isolation (pure, fake readers) and swappable for an external
  PDP (OPA/Cedar) later — the contract is unchanged.
- Behaviour parity with the stub (admin → all, member → none) preserved as data.
- No new pipeline primitive: the derived adapter uses the existing loader `setAdapter` seam.

### Negative / accepted trade-offs
- ADR-0020 #2 is partially reversed; documented here and back-referenced there.
- ReBAC relations are seedable/tested but not yet populated in production (plugin
  `resources.track` is deferred with plugin onboarding).
- `core/platform` and `core/ipc` gain a dependency on `core/contracts` (downward, no cycle).
- No decision cache yet (acceptable; fresh resolution is correct, just not optimized).

### Out of scope (deferred)
- ABAC; agent-token issuance / constrained delegation; admin UI + management UX; plugin
  permission declaration + relation-fact writing; audit sink; per-tenant PDP config UI.

## References
- ClickUp epic: <https://app.clickup.com/t/869def338>
- Design discussion: `docs/plans/2026-05-26-platform-authorization-design.md`
- Implementation plan: `~/.claude/plans/ticklish-spinning-summit.md`
- ADR-0020 (identity & authentication); ADR-0001 (adapter pipeline); ADR-0021 (plugin/platform boundary)

---

**Last Updated:** 2026-05-30
