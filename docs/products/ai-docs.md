# @kb-labs/ai-docs

**Status:** MVP 1.0
**Category:** AI Products
**Repository:** [kb-labs-ai-docs](https://github.com/KirillBaranov/kb-labs-ai-docs)

## Overview

Engineering-first documentation assistant for KB Labs projects. Bootstrap, plan, generate, and audit technical docs without silent overwrites, powered by Mind context and LLMs.

## Key Features

- **Bootstrap** - Initialize documentation workspace with `kb ai-docs:init`
- **Planning** - Build machine-readable plan/TOC from existing code and docs with `kb ai-docs:plan`
- **Generation** - Generate or sync sections with Mind context integration using `kb ai-docs:generate`
- **Drift Detection** - Monitor drift between code and documentation with `kb ai-docs:audit`
- **No Silent Overwrites** - Explicit control over documentation changes
- **Mind Integration** - Uses Mind RAG for accurate, context-aware generation
- **Dry-Run Support** - Preview changes before applying

## Commands

| Command | Purpose |
|---------|---------|
| `kb ai-docs:init` | Bootstrap documentation workspace |
| `kb ai-docs:plan` | Plan/restructure documentation |
| `kb ai-docs:generate` | Generate/sync documentation sections |
| `kb ai-docs:audit` | Detect drift between code and docs |

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-ai-docs/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-ai-docs/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-ai-docs/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/mind, @kb-labs/plugin
- Used by: Documentation workflows, AI-powered documentation generation


