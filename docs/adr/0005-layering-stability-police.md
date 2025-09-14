# ADR-0005: Layering & Stability Policy

**Status:** Accepted  
**Context:** KB Labs ecosystem (core, shared, products)  
**Date:** 2025-09-15

---

## Decision

### 1. Layers

- **@kb-labs/core**: Infrastructure kernel. Contains only abstractions (CLI-kit, config runtime, plugin API, telemetry, provider interfaces, utils).
  - ❌ No domain-specific logic (rules, docs, tests, ADR).
- **@kb-labs/shared**: Shared knowledge layer. Contains models, loaders, operations, retrieval, context-assembly, prompt-kit, textops.
  - ❌ No product UX, rendering, or CLI commands.
- **@kb-labs/ai-*** (products): Final products (ai-review, ai-docs, ai-tests). Contain commands, UX, rendering, profiles.
  - ✅ Depend on core + shared.

### 2. Import boundaries

- **Allowed**: products → shared → core.
- **Forbidden**: reverse dependencies.
- **Enforced** via lint rules (no-restricted-imports).

### 3. Public API

- Only expose top-level facades for each submodule.
- **Markers**: `@stable` (guaranteed compatibility) / `@experimental` (may change).
- **SLA**: minor releases cannot break `@stable` APIs.

### 4. Compatibility

- Breaking changes only in major releases.
- Deprecations must use `@deprecated` and remain supported for at least 2 minor releases before removal.
- Contract tests guarantee identical output for canonical fixture repositories.

### 5. Change process

- Any new public contract requires a lightweight RFC/ADR.
- Each ADR must record motivation, allowed/forbidden boundaries, and compatibility notes.

### 6. Release cadence & stability

- **core**: slow-moving, maximum stability.
- **shared**: more frequent minors, but `@stable` facades must remain intact.
- **products**: fast-moving, pinned against major versions of core and shared.

---

## Consequences

- Products stay thin and reusable across the ecosystem.
- New products can be built quickly without duplicating logic.
- Strong stability guarantees enable long-term sustainability.
- **Cost**: discipline required (lint rules, ADRs, contract tests, semantic versioning).