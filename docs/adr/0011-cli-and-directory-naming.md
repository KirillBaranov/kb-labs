# ADR-0011: CLI and Directory Naming

**Date:** 2025-10-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [cli, architecture]  

## Context

When designing the KB Labs Ecosystem, we faced the question of how to name:
- CLI binary for running commands (profiles, review, tests, etc.)
- Project directory where profiles and configurations are stored (.kb/profiles/...)

**Options considered:**
- `kb` vs `kb-labs` for the binary
- `.kb/` vs `.kb-labs/` for the directory

This decision affects user experience, brand perception, and adoption across different organizations.

## Decision

We establish canonical naming conventions for the KB Labs ecosystem:
- **Canonical CLI name**: `kb`
- **Canonical directory**: `.kb/`

**Additional flexibility:**
- CLI supports `--profiles-dir` flag and `KB_PROFILES_DIR` environment variable for custom paths
- Legacy `.kb-labs/` directory will be supported as an alias with deprecation warnings

## Rationale

- **Simplicity**: Short and neutral. `kb` and `.kb/` are easy to type and not overloaded with branding
- **Git-like UX**: Similar to `.git/` + `git` being perceived as a system standard. `.kb/` + `kb` creates the same UX pattern
- **Vendor-agnostic**: Easier to adapt for third-party teams without carrying "labs" into project roots
- **OSS-friendly**: Developers don't feel pressure from "foreign branding" in their projects
- **Flexibility**: `--profiles-dir` flag and `KB_PROFILES_DIR` allow path customization for enterprise teams with custom layouts

## Consequences

**Positive:**
- Consistent, memorable CLI and directory naming
- Familiar UX pattern similar to Git
- Vendor-neutral approach encourages adoption
- Flexible configuration options for different use cases

**Negative:**
- Migration required for existing configurations
- Need to maintain backward compatibility during transition
- Documentation updates required across all examples

## Implementation

- All examples and documentation will use `kb` CLI and `.kb/` directory
- Existing DevKit and CI configurations will be migrated to `.kb/`
- During transition period, `.kb-labs/` will be supported with deprecation warnings
- Update all tooling and templates to use new naming conventions

## Alternatives Considered

- **`kb-labs` CLI** — rejected (too branded, less universal)
- **`.kb-labs/` directory** — rejected (carries branding into user projects)
- **`kblabs` CLI** — rejected (less memorable, harder to type)

## Follow-ups

- Update all documentation and examples to use `kb` CLI
- Migrate existing configurations from `.kb-labs/` to `.kb/`
- Add deprecation warnings for legacy directory usage
- Update DevKit templates and CI configurations

---

*Last updated: October 01, 2025*  
*Next review: December 22, 2025*
