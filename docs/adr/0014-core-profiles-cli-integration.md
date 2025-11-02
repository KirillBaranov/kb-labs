# ADR-0014: Core Profiles and CLI Integration

**Date:** 2025-10-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, cli, integration]  

## Context

The Profiles subsystem forms the backbone of KB Labs' configuration and automation layer. It defines how products (AI Review, AI Docs, AI Tests, etc.) resolve, validate, and extend their operational schemas.

Until now:
- `@kb-labs/profile-schemas` handled only schema validation and fixtures
- `@kb-labs/core` and `@kb-labs/core-config` did not have integrated profile awareness
- `@kb-labs/cli-bin` had no direct commands to create, validate, or resolve profiles

This ADR consolidates all these parts into a unified, high-level API and CLI interface.

## Decision

We introduce a comprehensive profiles integration across the KB Labs ecosystem:

1. **Centralized `ProfileService` in `@kb-labs/core-profiles`**
   - High-level API with caching, strict mode, and debug dumps
   - Unified access through `createProfileServiceFromConfig()`
   - Supports loading, validating, resolving, and merging profiles

2. **Configuration layer integration**
   - `@kb-labs/core-config` now exposes a `profiles` section
   - `SYSTEM_DEFAULTS` provide global defaults for profile resolution
   - The factory (`createProfileServiceFromConfig`) connects config ⇆ profiles seamlessly

3. **CLI command extensions**
   - `kb profiles:validate` — validate local profiles
   - `kb profiles:resolve` — resolve profiles with inheritance
   - `kb profiles:init` — create a new profile interactively or non-interactively

4. **Consistent developer experience**
   - Unified logging via `KB_PROFILES_LOG_LEVEL`
   - Structured JSON output and correct exit codes
   - Config-driven instantiation (no manual wiring required)

## Implementation

| Area | Package | Description |
|------|---------|-------------|
| **Schemas** | `@kb-labs/profile-schemas` | JSON Schemas for profiles and fixtures validation |
| **Core Logic** | `@kb-labs/core-profiles` | Implements `ProfileService`, resolver, validator, merger |
| **Config** | `@kb-labs/core-config` | Adds `profiles` section + system defaults |
| **CLI** | `@kb-labs/cli-bin` | Adds `profiles:init`, `profiles:validate`, `profiles:resolve` commands |

### Key Implementation Commits
- `7b3a8cf` – config integration + factory  
- `6567f0f` – core profiles MVP with metadata and defaults  
- `4f19244` – fixed TypeScript DTS build and tests  
- `8c8e1de` – CLI commands for profiles (init/validate/resolve)

## Consequences

**Positive:**
- Unified profiles layer now fully operational across the ecosystem
- CLI can create, resolve, and validate profiles instantly
- All parts share consistent defaults, schemas, and validation
- Foundation ready for future features:
  - `profiles:list`, `profiles:diff`, and `profiles:migrate`
  - AI-assisted profile generation
  - Workspace-level caching and metrics

**Negative:**
- Additional complexity in the configuration layer
- More CLI commands to maintain and document

## Follow-ups

- Integrate profiles into `@kb-labs/cli` global config commands
- Add analytics events (`profile.created`, `profile.validated`, etc.)
- Implement diffing engine for profile changes
- Link to KB Labs Studio for profile visualization

---

*Last updated: October 5, 2025*  
*Next review: January 5, 2026*