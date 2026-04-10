# ADR-0009: SDK API Removal Gate with Explicit Breaking Acknowledgement

**Date:** 2026-03-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-01
**Tags:** [process, tooling]

## Context

`@kb-labs/sdk` is the public face of KB Labs for plugin developers.  
Accidental removal of exports or contract surface drift creates high migration cost and trust loss.

The repository already has quality checks and export surface snapshots, but we need one explicit policy:

- additive API changes are allowed by default
- removals/breaking changes require explicit approval artifact

## Decision

Adopt a mandatory API-removal gate in SDK CI:

1. Generate and keep `packages/sdk/EXPORTS-GLOSSARY.md` in sync from entrypoint surfaces.
2. On pull requests, compare glossary entries against the base branch.
3. If any exports are removed, fail CI unless `packages/sdk/BREAKING_CHANGE.md` is updated in the same PR.

Implementation details:

- Workflow: `.github/workflows/sdk-contracts.yml`
- Checker script: `packages/sdk/scripts/check-api-removals.mjs`
- Acknowledgement document: `packages/sdk/BREAKING_CHANGE.md`

## Consequences

### Positive

- Prevents silent SDK breakage.
- Creates an auditable decision trail for intentional breaking changes.
- Keeps contributor workflow simple for non-breaking additive work.

### Negative

- Slightly more CI complexity.
- Intentional breaking changes require extra documentation overhead.

### Alternatives Considered

- Manual reviewer discipline only: rejected as too error-prone.
- GitHub labels as sole approval mechanism: rejected due to weaker auditability in-repo.
- Full API Extractor-only gate: useful, but does not replace explicit human acknowledgement policy.

## Implementation

- `sdk-contracts` workflow enforces glossary sync and API removal checks.
- Contributors must update `BREAKING_CHANGE.md` for intentional removals.
- This ADR will be revisited when SDK reaches long-term stable GA and governance can tighten further.
