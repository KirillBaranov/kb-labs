# Getting Started

This guide walks through running the AI Review plugin locally and understanding the generated outputs.

## 1. Install dependencies

```bash
pnpm install
```

The workspace links local packages (contracts, core, providers, plugin). `pnpm install` also triggers DevKit sync to align TypeScript and linting presets.

## 2. Build packages (optional for development)

Most commands run directly from source via ts-node. For a clean baseline or before publishing artifacts, build the packages:

```bash
pnpm --filter @kb-labs/ai-review-plugin run build
```

## 3. Prepare a diff

AI Review expects a unified diff file. Create one by comparing your branch with the target branch:

```bash
git diff origin/main...HEAD > /tmp/changes.diff
```

You can also supply a diff produced by external tools (CI pipelines, patch generators, etc.).

## 4. Execute the CLI command

```bash
pnpm kb ai-review run --diff /tmp/changes.diff --provider local
```

This command:

- Loads the `frontend` profile by default (override with `--profile`).
- Runs the `local` provider (override with `--provider mock`).
- Writes artifacts under `.ai-review/` (relative to repo root).

Sample console output:

```
Findings: 3 (critical 0, major 1, minor 2, info 0) — top major
Artifacts stored under .ai-review/reviews/frontend
Exit code: 10
```

Add `--json` to print the full `AiReviewCommandOutput` payload:

```bash
pnpm kb ai-review run --diff /tmp/changes.diff --json
```

## 5. Inspect artifacts

The command creates:

- `.ai-review/reviews/<profile>/review.json` – canonical `AiReviewRun` payload.
- `.ai-review/reviews/<profile>/review.md` – transport Markdown with embedded JSON.
- `.ai-review/reviews/<profile>/review.human.md` – human-focused Markdown summary (disable via `--no-render-human-markdown`).
- `.ai-review/reviews/<profile>/review.html` – optional HTML rendition (enable with `--render-html`).
- `.ai-review/context/<profile>.md` – context document (handbook, rules, ADR excerpts).

## 6. Control failure thresholds

Use `--fail-on major` or `--fail-on critical` to make the command exit non-zero when high-severity findings appear. The default behaviour maps severities to exit codes (critical → 20, major → 10, others → 0).

## 7. Run via workflow

The same pipeline is exposed as the `ai-review.workflow.run` step. When the KB workflow engine invokes this step, it passes the same input shape as the CLI command and receives identical artifacts. See [`workflow-step`](../kb-labs-ai-review/packages/ai-review-plugin/src/runtime/workflow.ts) for reference implementation.

## 8. Next steps

- Dive into [`cli-guide.md`](./cli-guide.md) for a comprehensive flag and output reference.
- Refer to [`architecture.md`](./architecture.md) to learn how packages interact.
- Check [`faq.md`](./faq.md) if you hit common issues (missing profiles, artifact paths, etc.).

