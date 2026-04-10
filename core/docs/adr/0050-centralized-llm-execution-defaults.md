# ADR-0050: Centralized LLM Execution Defaults with Plugin Escape Hatch

**Date:** 2026-02-24
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-24
**Tags:** llm, cache, streaming, platform, configuration

## Context

`useLLM()` already supports execution policy (cache/stream), but this forced plugin authors to repeatedly configure infrastructure behavior in business code.

This conflicts with platform goals:
- infrastructure concerns should be centralized;
- plugins should focus on product/business logic;
- behavior should be consistent across products and execution modes.

At the same time, some plugins still need rare, explicit overrides for special cases.

## Decision

Introduce **platform-managed execution defaults** for LLM calls:

- New config field in `platform.adapterOptions.llm`:
  - `executionDefaults?: LLMExecutionPolicy`
- Runtime wraps LLM adapters with `DefaultExecutionPolicyLLM`.
- Defaults are applied automatically to all `complete`, `stream`, `chatWithTools` calls.
- Plugin-level policy remains available through `useLLM({ execution })`.

### Merge Priority

From lowest to highest precedence:

1. `adapterOptions.llm.executionDefaults` (platform default)
2. `useLLM({ execution })` (plugin-level override)
3. per-call `llm.complete(..., { execution })` (call-level override)

## Consequences

### Positive

- Centralized infrastructure policy in `kb.config.json`.
- Consistent cache/stream behavior across plugins.
- Keeps escape hatch for advanced scenarios.
- Works for default adapter and router-loaded adapters.
- No API break for existing plugin calls.

### Negative

- One extra wrapper layer around LLM adapter chain.
- Misconfigured global defaults can impact all plugins at once.

### Alternatives Considered

- Plugin-only policy (rejected: duplicates infra logic in product code).
- Hard-disable plugin overrides (rejected: removes necessary flexibility).
- Async config lookup inside `useLLM` (rejected: changes ergonomics and complexity).

## Implementation

### Files

1. `core-runtime/src/config.ts`
   - Added `LLMAdapterOptions.executionDefaults`.
2. `core-runtime/src/wrappers/default-execution-policy-llm.ts`
   - New wrapper merging default + local execution policies.
3. `core-runtime/src/loader.ts`
   - Applies wrapper to primary LLM chain and router `adapterLoader` adapters.

### Behavior Notes

- If `executionDefaults` is missing, wrapper is not applied.
- If plugin passes no `execution`, global defaults are used as-is.
- If plugin passes partial `execution`, merge is deep for `cache` and `stream`.

## References

- [ADR-0046: LLM Router](./0046-llm-router.md)
- [ADR-0049: Immutable Bound Adapter](./0049-llm-router-immutable-bound-adapter.md)
- [LLM Router README](../../packages/llm-router/README.md)

