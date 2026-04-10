# SDK API Contract

This document defines how `@kb-labs/sdk` public API should evolve before and after beta.

## Public Surfaces

Stable entry points:

- `@kb-labs/sdk`
- `@kb-labs/sdk/command`
- `@kb-labs/sdk/manifest`
- `@kb-labs/sdk/hooks`
- `@kb-labs/sdk/contracts`
- `@kb-labs/sdk/types`
- `@kb-labs/sdk/testing`

Anything outside these entry points is internal and can change without notice.

## Compatibility Rules

For stable entry points (1.x):

- Allowed in minor/patch:
  - Add new exports.
  - Add optional fields to objects/interfaces.
  - Add new overloads that keep existing calls valid.
- Not allowed in minor/patch:
  - Remove or rename exports.
  - Change function semantics incompatibly.
  - Narrow accepted input types.
  - Make optional fields required.

Breaking changes must go through a major version bump.

## Release Gate

Before release, run:

```bash
pnpm --filter @kb-labs/sdk docs:exports
SDK_BASE_REF=main pnpm --filter @kb-labs/sdk check:api-removals
pnpm --filter @kb-labs/sdk test
pnpm --filter @kb-labs/sdk type-check
pnpm --filter @kb-labs/sdk build
```

`src/__tests__/entrypoint-contracts.test.ts` is the minimum export compatibility gate.
`EXPORTS-GLOSSARY.md` must be in sync with current entrypoints.
Removing public exports is blocked in PR CI unless `BREAKING_CHANGE.md` is updated.
Deep regression checks live in:
- `src/__tests__/deep-behavior.test.ts` (runtime behavior invariants)
- `src/__type-tests__/sdk-typing.type-test.ts` (compile-time typing invariants)

In CI, use `.github/workflows/sdk-contracts.yml` as a required check for SDK-focused PRs.
