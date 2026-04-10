# FAQ & Troubleshooting

## "rules.json not found"

Ensure the profile exists. By default AI Review looks for `profiles/<profile>/docs/rules/rules.json` relative to the repository root. Override lookup with `--profiles-dir` if your profiles live elsewhere.

## "boundaries.json missing" warnings

Boundary rules are optional. The runtime logs a warning when `includeBoundaries` is true but the file is absent. Either add the file under `docs/rules/boundaries.json` or run with `--no-include-boundaries`.

## No findings returned

The `local` provider currently emits findings for:

- Inline TODO comments (`// TODO`, `/* TODO`).
- Imports reaching into `feature-*/internal` paths.
- Cross-layer violations configured in `boundaries.json`.

If your diff does not hit these patterns, the run will return zero findings. Use the `mock` provider to validate the pipeline end-to-end.

## Exit code is non-zero but stdout looks fine

The CLI prints a human-readable summary by default. Even when the summary looks acceptable, the exit code reflects severity thresholds. Run with `--json` to inspect the exact payload and follow the `summary.topSeverity` value.

## Artifacts directory not created

The command writes under `.ai-review/` relative to the repo root. If you execute the CLI outside the repository (e.g., in CI with a different working directory), pass `--diff` as an absolute path and set the working directory to the repo root before invoking the command.

## Context document is truncated

Large handbooks or ADR collections can exceed the default `contextMaxBytes` limit (1.5 MB). Increase `--context-max-bytes` or `--context-max-approx-tokens`. The runtime replaces oversized sections with placeholders so providers still receive deterministic input.

## How do I add a new provider?

Implement the `ReviewProvider` interface in `ai-review-providers`, export it from `index.ts`, and extend the CLI flag parsing to accept the new provider id. Providers receive raw diff text plus profile metadata and must return an `AiReviewRun` object.

## Can I run the workflow step outside KB workflows?

Yes. `runAiReviewWorkflow` is a thin adapter around `executeReview`. You can reuse the adapter in custom runtimes by providing a compatible `WorkflowExecutionContext` that handles artifact persistence.

## Updating DevKit synced files produces large diffs

`pnpm devkit:sync` keeps linting and TypeScript configs aligned across the KB Labs ecosystem. Commit the generated changes together with your feature branch to avoid drift. When the DevKit version upgrades, re-run the sync before merging.


