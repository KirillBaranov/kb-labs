# @kb-labs/devlink

**Status:** MVP 1.0  
**Category:** Tools & Infrastructure  
**Repository:** [kb-labs-devlink](https://github.com/KirillBaranov/kb-labs-devlink)

## Overview

Developer linker and ecosystem orchestrator for KB Labs. Automates local package linking, version sync, and publishing across multiple repositories using Yalc and PNPM.

## Key Features

- **Auto-Discovery** - Automatically scans repositories and detects local packages with dependencies
- **Smart Linking** - Intelligent linking strategies (auto, local, npm) with dependency graph analysis
- **Watch Mode** - Live file watching with automatic rebuild and consumer refresh
- **Version Sync** - Automatic version synchronization across linked packages
- **Publishing** - Automated publishing workflow

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-devlink/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-devlink/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-devlink/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/shared
- Used by: Development workflows, release-manager, audit


