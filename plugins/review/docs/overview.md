# KB Labs AI Review Overview

The `@kb-labs/ai-review` plugin brings automated code review heuristics, local analysis, and provider integrations into the KB Labs workflow platform. It reuses the legacy AI Review heuristics while adopting the modern plugin architecture (manifest v2, contracts, runtime surfaces).

## What the plugin does

- Scans unified diffs (files, branches, or generated patches) and applies deterministic heuristics for TODO comments, internal imports, and boundary violations.
- Normalises findings into the shared `AiReviewRun` contract so CLI, workflow, and future surfaces consume a single payload.
- Produces transport and human-readable artifacts (JSON, Markdown, optional HTML) under `.ai-review/`.
- Provides pluggable providers (`local`, `mock`) that can evolve toward LLM-backed review tiers.

## Repository packages

| Package | Purpose |
|---------|---------|
| `@kb-labs/ai-review-contracts` | Zod schemas + TypeScript types for commands, workflows, artifacts, and summary metrics. |
| `@kb-labs/ai-review-core` | Core analysis heuristics (diff parsing, TODO detector, boundary checks, risk scoring, Markdown rendering). |
| `@kb-labs/ai-review-providers` | Provider implementations (`local`, `mock`) exposing a shared `review()` contract. |
| `@kb-labs/ai-review-plugin` | Runtime manifest, CLI command, workflow handler, context builder, and artifact writers. |

## Surfaces in v1

- **CLI**: `kb ai-review run` executes the review pipeline and prints a summary or JSON payload.
- **Workflow step**: `ai-review.workflow.run` enables automation pipelines to request reviews and save artifacts.
- **Artifacts**: Machine-readable JSON, transport Markdown, human Markdown, optional HTML, and the context bundle used for provider inputs.

## How the pipeline executes

1. Read diff + load profile rules/boundaries.
2. Build context document (handbook + rules + ADR excerpts) with size safeguards.
3. Invoke provider (`local` or `mock`) to generate findings.
4. Clamp findings via max-comment thresholds, compute summary + risk score.
5. Write artifacts and return `AiReviewCommandOutput` for CLI/workflow consumers.

## Where to go next

- See [`getting-started.md`](./getting-started.md) for local execution steps.
- Review [`cli-guide.md`](./cli-guide.md) for flag reference and output formats.
- Dive into [`architecture.md`](./architecture.md) to understand package boundaries and extension points.

