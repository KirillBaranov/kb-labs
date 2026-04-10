# Architecture Guide

AI Review is organised as a multi-package workspace that separates public contracts, core analysis, providers, and runtime surfaces. This section documents the layering principles and extension points.

## Package boundaries

```
packages/
├── ai-review-contracts
├── ai-review-core
├── ai-review-providers
└── ai-review-plugin
```

| Package | Responsibilities | Depends on |
|---------|------------------|-------------|
| `ai-review-contracts` | Zod schemas, TypeScript types, and the manifest used by external consumers. No Node or FS dependencies. | – |
| `ai-review-core` | Pure analysis utilities: diff parser, heuristics, scoring, Markdown rendering, boundaries helpers. | `ai-review-contracts` (types only), shared review types |
| `ai-review-providers` | Provider abstraction + implementations (`local`, `mock`). Calls core analysis, shapes `AiReviewRun` payloads. | `ai-review-contracts`, `ai-review-core` |
| `ai-review-plugin` | Manifest v2, CLI command, workflow step, context builder, artifact writers, and runtime glue. | `ai-review-contracts`, `ai-review-core`, `ai-review-providers`, shared profiles |

## Runtime flow

```
CLI / Workflow input
        │
        ▼
executeReview(options)
        │
        ├─ loadRules + loadBoundaries (profile.ts)
        ├─ buildContextDocument (context.ts)
        ├─ provider.review(..)
        ├─ computeSummary + clamp findings
        └─ writeReviewArtifacts(..)
        │
        ▼
AiReviewCommandOutput (run + artifacts + exitCode)
```

### Context builder

- Assembles handbook markdown, rules JSON, optional boundaries, and ADR excerpts.
- Applies byte and token limits; replaces sections with placeholders when limits are exceeded.
- Computes metadata hashes to track base vs final content.

### Providers

- Implement the shared `ReviewProvider` interface (`review(input) => AiReviewRun`).
- `local`: runs deterministic heuristics from `ai-review-core`.
- `mock`: emits sample findings for smoke tests and demos.
- Future providers (LLM-backed) should live in this package and can use the same contracts.

### Artifacts

`writeReviewArtifacts` writes:

- Canonical JSON (`review.json`).
- Transport Markdown that embeds the JSON payload.
- Human Markdown summary derived from findings.
- Optional HTML rendering of the human Markdown.
- Context markdown (path returned alongside artifacts).

### Workflow integration

- `runAiReviewWorkflow` adapts `executeReview` to the plugin runtime.
- Artifacts are saved via `ctx.artifacts.save`, so workflow hosts can persist or publish them.
- Analytics hooks can be wired by emitting events via `ctx.analytics.emit` (reserved for future MVP scope).

## Extension guidelines

- **Add providers**: extend `ai-review-providers`, export from `index.ts`, and make them discoverable via configuration or CLI flags.
- **Extend heuristics**: implement new checks in `ai-review-core` (e.g., additional regex scanners). Update risk scoring if severity weightings change.
- **Adjust artifacts**: modify `writeReviewArtifacts` to emit new report formats; update contracts if outputs change shape.
- **Introduce new surfaces**: add manifest entries (REST, Studio, etc.) in `ai-review-plugin/src/manifest.v2.ts`, build on top of existing runtime utilities.

## Testing strategy

- **Unit**: `ai-review-core` tests cover heuristics and scoring.
- **Provider smoke tests**: `ai-review-providers` ensures deterministic outputs from `local`/`mock` providers.
- **Runtime tests**: `ai-review-plugin/tests` cover the CLI pipeline (`executeReview`) and workflow adapter.
- **Fixture hygiene**: generate diffs under `tests/__fixtures__` or inline helper functions to avoid large snapshots.

Keep architecture decisions synchronised in `docs/adr/` as features evolve. Significant changes (new providers, new artifact types, analytics integration) should receive dedicated ADRs.


