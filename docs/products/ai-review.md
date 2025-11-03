# @kb-labs/ai-review

**Status:** MVP 1.0  
**Category:** AI Products  
**Repository:** [kb-labs-ai-review](https://github.com/KirillBaranov/kb-labs-ai-review)

## Overview

AI-powered code review framework with profile-based rules, dual output (JSON + Markdown), and GitHub/GitLab integration. Designed to catch architectural and stylistic issues beyond static linters.

## Key Features

- **Profile-Based Rules** - Isolated rule sets (frontend, backend, e2e) with handbooks and ADRs
- **AI-Powered Analysis** - Leverages AI to understand code context and intent
- **Dual Output** - Machine-readable JSON and human-readable Markdown reports
- **CI/CD Integration** - GitHub Actions and GitLab CI integration
- **Extensible Providers** - Support for multiple AI providers (OpenAI, Claude, Mock)

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-ai-review/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-ai-review/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-ai-review/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/shared
- Used by: CI/CD pipelines, development workflows

**Note:** Currently migrating to new architecture (core/cli/shared/template).


