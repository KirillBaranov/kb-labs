# @kb-labs/release-manager

**Status:** MVP 1.0  
**Category:** Tools & Infrastructure  
**Repository:** [kb-labs-release-manager](https://github.com/KirillBaranov/kb-labs-release-manager)

## Overview

Unified release orchestration for monorepo packages. Combines audit, devlink, mind checks with version management and publishing. Guarantees that releases only happen when all quality gates pass.

## Key Features

- **Quality Gates** - Checks code quality (audit, build, tests) before release
- **Version Management** - Automatic version bumping and changelog generation
- **Publishing** - Automated package publishing workflow
- **Traceability** - Full release traceability and history
- **Release Checks** - Pre-release validation and checks

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-release-manager/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-release-manager/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-release-manager/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/shared, @kb-labs/audit, @kb-labs/devlink, @kb-labs/mind
- Used by: CI/CD pipelines, release workflows


