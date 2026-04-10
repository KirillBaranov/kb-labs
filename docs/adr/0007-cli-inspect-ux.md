# ADR-0007: Unified Inspect UX for CLI

**Date:** 2025-10-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [cli, ui/ux, observability]

## Context
Developers need a concise, consistent way to understand the current state of profiles, product configs, and bundles without reading code or manifests. Existing commands (`doctor`, `explain`, `print`) partially cover this but lack a focused diagnostic summary with the same UX across areas.

## Decision
Introduce inspect-style commands with a unified UX and structured JSON output:

1) `profiles:inspect` — Profile v1.0 summary (name@version, path, overlays, products)  
2) `profiles:validate` — Validate v1.0 manifest (legacy format is not supported)  
3) `config:inspect` — Product config summary + validation result  
4) `bundle:inspect` — Profile + config + artifacts summary + optional compact trace

UX rules:
- Text mode: shared UI components (box/safeSymbols/safeColors)
- JSON mode: clean structured output without extra noise
- Common flags: `--product`, `--profile-key`, `--cwd`, `--json`, optional `--trace`
- Errors: show first N issues; suggest `--json` for full list

## Consequences

### Positive
- Faster diagnosis and onboarding
- Consistent CLI experience (aligned with `doctor`)
- Clear boundary: only v1.0 profile manifests are supported

### Negative
- Additional commands to maintain
- Some overlap with `explain`/`print` (mitigated by concise scope)

## Alternatives Considered
- Extend only `doctor` with more modes  
  Rejected: would overload a health-check tool with deep inspection semantics.
- Rely solely on `print`/`explain`  
  Rejected: too verbose or too low-level for quick diagnostics.

## Implementation Details
- New commands in `@kb-labs/core-cli`:
  - `packages/cli/src/cli/profiles/validate.ts`
  - `packages/cli/src/cli/profiles/inspect.ts`
  - `packages/cli/src/cli/config/inspect.ts`
  - `packages/cli/src/cli/bundle/inspect.ts`
  - Registered in `packages/cli/src/cli.manifest.ts`
- Profile validation enforces `schemaVersion: "1.0"` only
- Docs updated in `docs/CLI_README.md`

## Future Considerations
- Expand `inspect` output with size stats and artifacts sampling when `--artifacts` specified
- Optional `--no-fail` to mirror validation behavior
- Add cross-references to lockfile status and policy permits in `bundle:inspect`


