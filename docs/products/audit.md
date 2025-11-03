# @kb-labs/audit

**Status:** MVP 1.0  
**Category:** Tools & Infrastructure  
**Repository:** [kb-labs-audit](https://github.com/KirillBaranov/kb-labs-audit)

## Overview

Unified quality audit framework for KB Labs monorepo packages. Combines existing quality checks (eslint, tsc, vitest, build, devlink, mind, security) into a single orchestrator, producing machine-readable JSON reports and human-readable summaries.

## Key Features

- **Unified Quality Checks** - Runs all quality checks (style, types, tests, build, devlink, mind, security) with a single command
- **Machine-Readable Reports** - JSON output for CI/CD pipelines and release-manager integration
- **Human-Readable Reports** - Markdown, Text, and HTML summaries
- **Check Registry** - Extensible check adapter system
- **Result Aggregation** - Combines results from multiple checks into unified reports

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-audit/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-audit/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-audit/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/shared, @kb-labs/devlink, @kb-labs/mind
- Used by: CI/CD pipelines, release-manager, development workflows


