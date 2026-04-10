# KB Labs AI Review Documentation Standard

> **This document adapts the KB Labs Documentation Standard for the AI Review plugin.**  
> See the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for baseline requirements shared across the ecosystem.

## Project-specific focus areas

AI Review documentation should prioritise:

- How to execute the review pipeline via CLI and workflows.
- Contract stability for artifacts (`AiReviewRun`, Markdown/HTML reports, context bundle).
- Extending heuristics, providers, and risk scoring.
- Operational guidance (profiles, context limits, CI integration).

## Repository documentation structure

```
docs/
├── DOCUMENTATION.md        # This document
├── overview.md             # Product summary and package map
├── getting-started.md      # Quick start for local runs
├── cli-guide.md            # Command reference
├── architecture.md         # Package boundaries and flows
├── faq.md                  # Troubleshooting
└── adr/                    # Architecture Decision Records
    ├── 0000-template.md    # ADR template
    └── 0001-*.md           # Project ADRs
```

## Required documents

- [x] Root `README.md` describing the workspace and quick start.
- [x] `CONTRIBUTING.md` with development workflow and manifest checklist.
- [x] `docs/overview.md`
- [x] `docs/getting-started.md`
- [x] `docs/cli-guide.md`
- [x] `docs/architecture.md`
- [x] `docs/faq.md`
- [x] `docs/adr/0000-template.md`

## Optional additions

Consider adding when the feature set expands:

- `docs/providers.md` – catalog available providers and configuration knobs.
- `docs/examples.md` – end-to-end CI examples, artifact consumption patterns.
- `docs/analytics.md` – when analytics emissions are implemented.
- Glossary entries for risk scoring, fingerprinting, and profile terminology.

## ADR expectations

- Follow the template in `docs/adr/0000-template.md`.
- Capture significant changes: new providers, artifact schema updates, analytics integration, workflow behaviour.
- Include tags from the approved list (architecture, process, runtime, contracts, dx, etc.).
- Link PRs and related ADRs for traceability.

## Cross-linking

**Dependencies**
- [`@kb-labs/shared-review-types`](https://github.com/KirillBaranov/kb-labs-shared) – shared finding contracts.
- [`@kb-labs/shared-profiles`](https://github.com/KirillBaranov/kb-labs-shared) – source for profile rules and boundaries.
- [`@kb-labs/devkit`](https://github.com/KirillBaranov/kb-labs-devkit) – linting/TypeScript/build presets.

**Used by**
- KB CLI workflows (`kb ai-review run`).
- KB workflow engine step `ai-review.workflow.run`.
- Future Studio or REST surfaces (tracked in ADRs when added).

---

**Last Updated:** 2025-11-13  
**Standard Version:** 1.0 (aligned with KB Labs ecosystem standard)


