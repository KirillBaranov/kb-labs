# @kb-labs/plugin

**Status:** MVP 1.0
**Category:** Orchestration
**Repository:** [kb-labs-plugin](https://github.com/KirillBaranov/kb-labs-plugin)

## Overview

Plugin system infrastructure for KB Labs ecosystem. Provides manifest definitions (V1/V2), runtime execution with sandboxing, and adapters for seamless integration with CLI, REST API, and Studio.

## Key Features

- **Manifest System** - V1 (legacy) and V2 (modern) manifest format support
- **Runtime Execution** - Plugin execution engine with sandbox isolation
- **Platform Adapters** - Seamless integration with CLI, REST API, and Studio UI
- **Permission System** - Fine-grained permissions for plugin capabilities
- **Developer Tools** - Tools and utilities for plugin development and debugging
- **Plugin Discovery** - Automatic plugin discovery and registration

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-plugin/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-plugin/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-plugin/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/shared
- Used by: @kb-labs/cli, @kb-labs/rest-api, @kb-labs/workflow, all AI products
