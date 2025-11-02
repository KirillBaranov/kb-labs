# ADR-0006: Local Development Linking Policy

**Date:** 2025-09-15
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [process, tooling]

---

## Decision

- During early development, all repositories (core, shared, products) remain independent.
- No local linking is required until a product package starts consuming stable APIs from `@kb-labs/core` or `@kb-labs/shared`.
- When integration becomes necessary, we will use **yalc** (preferred) or `pnpm link` / `npm pack` as alternatives for local linking.
- Linking is temporary and intended only for local development and testing.
- Official package consumption (CI, releases, production) will always rely on published npm versions.

---

## Rationale

- **Avoid premature complexity**: linking adds overhead before cross-package dependencies are stable.
- **Allow rapid iteration** on core APIs without maintaining sync tooling.
- **Ensure products can be developed independently** until integration is truly required.
- **Guarantee reproducibility**: CI and production builds use only published artifacts.

---

## Consequences

- Developers can work on core and products separately in the early phase.
- Once the first product consumes core APIs, **yalc** will be introduced to test real-world integration.
- Future ADRs may define migration from yalc to a full pnpm workspace or automated release pipeline if/when the ecosystem scales further.
