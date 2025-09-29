# ADR-0010: One Package = One Responsibility

**Date:** 2025-09-30  
**Status:** Proposed  
**Deciders:** KB Labs Team  

## Context

The KB Labs ecosystem is growing: DevKit, product-template, core, cli, shared, ai-review, and the new profiles layer. This growth requires:
- Low coupling between components
- Independent releases and testing
- Clear responsibility boundaries
- Ease of use for external contributors and plugins

## Decision

We adopt the principle "One package = One responsibility" and establish separate packages:

- **@kb-labs/devkit** — Bootstrap and standards (CI templates, configs, sync)
- **@kb-labs/product-template** — Project scaffolding (5-minute deployment)
- **@kb-labs/core** — Runtime core (including profiles resolver/validator in MVP)
- **@kb-labs/cli** — UX wrapper over core (kb * commands)
- **@kb-labs/shared** — Common types/utilities without side effects
- **@kb-labs/profile-schemas** — JSON Schema only for profiles/rules/products
- **@kb-labs/ai-review** — Product consumer (migrating to core/cli)

Each package:
- Has clear API boundaries, own tests/fixtures/releases
- Does not carry others' responsibilities
- Exports only the minimally necessary

## Alternatives Considered

1. **Schemas inside core** — Faster start, but bloats core and hinders external reuse
2. **Monolith core+cli+schemas** — Simple release, but high coupling, heavy incremental changes

**Choice:** Separate @kb-labs/profile-schemas package + thin dependencies

## Rationale

- **Testability**: Local fixtures, fast CI, fewer cascade failures
- **Releases**: Independent semver streams, canary releases without team stoppage
- **OSS/Plugins**: External parties only need profile-schemas, not the entire core
- **Architecture discipline**: SRP (SOLID), explicit boundaries and contracts

## Scope

- Applies to all current and future packages in the KB Labs ecosystem
- Specifically establishes the separation of @kb-labs/profile-schemas

## Non-Goals

- Not introducing UI for profiles at this time
- Not requiring DevKit to contain profiles — only tools/validation in CI

## Contracts and Versions

- Packages follow semver
- @kb-labs/profile-schemas publishes $id for JSON Schema, compatibility declared as:
```json
"kbProfile": { "compat": { "schema": "^1.0.0" } }
```

- Breaking changes in schemas → major profile-schemas version, products check compatibility on startup

## Consequences

**Positive:**
- Independent releases, cleaner codebase, easier onboarding/contributing, readiness for external plugins

**Negative:**
- More packages → slightly more "admin overhead" (solved by product-template and DevKit workflow)

## Implementation Plan

1. **Create @kb-labs/profile-schemas@0.1.0:**
   - src/profile.schema.json, src/rules.schema.json, src/products/{review,tests,docs,assistant}.schema.json
   - scripts/validate.mjs (ajv), fixtures fixtures/{valid,invalid}.json
   - exports in package.json for all schemas

2. **Migrate @kb-labs/core and @kb-labs/cli** to use only @kb-labs/profile-schemas (no local schema copies)

3. **In @kb-labs/product-template:**
   - Add .kb/profiles/default/profile.json with $schema → public $id
   - devDependency on @kb-labs/profile-schemas
   - Scripts profiles:{list,resolve,validate}

4. **In @kb-labs/devkit:**
   - Reusable workflow profiles-validate.yml (step kb profiles validate --all --strict)
   - Optional: target sync for schemas if local access needed

5. **In @kb-labs/ai-review:**
   - Adapter for reading ResolvedProfile (fallback to legacy until migration complete)
   - All file traversal through common filterPaths

6. **Update documentation** (README/Obsidian/ADR links)

## Testing

- **Unit**: In profile-schemas validate fixtures against all schemas
- **Integration**: In core test resolve and merge (defaults→product overrides)
- **CLI**: Snapshot tests for kb profiles resolve/validate
- **CI**: Run reusable profiles-validate.yml in product-template

## Risk Mitigation

- **Schema-core divergence**: Single source (schemas package), CI blocks desync
- **Release complexity**: Changesets/release scripts in monorepo; independent versioning
- **Performance in large repos**: Later step — resolve cache, lazy I/O (not part of ADR, but in roadmap)

## Open Questions

- Is TypeScript declaration generation from schemas needed? (useful for strict typing in TS)
- Public hosting of $id-URL (GitHub Pages / Cloudflare Pages) — when?
- Package signing/provenance policy (npm provenance) — enable by default?

## Related Decisions

- ADR "Profiles: Defaults & Overrides"
- ADR "Profiles: IO & Diff Policy"  
- ADR "Profiles: Security & Provenance"

---

## Implementation Checklist

- [ ] Created @kb-labs/profile-schemas and published 0.1.0
- [ ] Core/CLI use schemas from package
- [ ] Product-template includes $schema + devDependency
- [ ] DevKit workflow profiles-validate enabled
- [ ] AI Review uses ResolvedProfile through adapter
- [ ] Updated ADR/README/Obsidian notes

---

*Last updated: September 30, 2025*  
*Next review: December 30, 2025*