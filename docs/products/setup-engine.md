# @kb-labs/setup-engine

**Status:** MVP 1.0
**Category:** Orchestration
**Repository:** [kb-labs-setup-engine](https://github.com/KirillBaranov/kb-labs-setup-engine)

## Overview

Setup workflows for the KB Labs ecosystem. Provides declarative operations, idempotent execution, and rollback-ready installers for plugins, CLIs, and platform tools.

## Key Features

- **Declarative Operations** - Type-safe operation primitives with fluent builder API
- **Idempotent Execution** - Safe to run multiple times with same result
- **Rollback Support** - Automatic rollback on errors with transactional execution
- **Diff Previews** - Preview changes before applying them
- **Plugin Setup** - Powers `kb <plugin> setup` commands
- **Workspace Bootstrap** - Initialize KB Labs workspaces with required tools

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-setup-engine/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-setup-engine/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-setup-engine/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core
- Used by: @kb-labs/plugin, plugin setup commands, workspace initialization
