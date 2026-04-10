# @kb-labs/cli-commands

> **Command implementations for KB Labs CLI.** Contains command implementations and registry system for KB Labs CLI with plugin-based architecture, command discovery, execution, and help generation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/cli-commands** provides command implementations and registry system for KB Labs CLI. It includes plugin-based command architecture, command discovery, execution, help generation, and built-in system commands.

## 🏗️ Architecture

### Core Components

#### Command Registry

- **Purpose**: Discover and register commands
- **Responsibilities**: Plugin discovery, manifest validation, command registration
- **Dependencies**: cli-core, plugin-manifest

#### Command Execution

- **Purpose**: Execute commands
- **Responsibilities**: Command routing, handler execution, error handling
- **Dependencies**: Registry, cli-core

#### Help Generation

- **Purpose**: Generate help output
- **Responsibilities**: Global help, group help, manifest help
- **Dependencies**: Registry

### Design Patterns

- **Registry Pattern**: Command registry
- **Plugin Pattern**: Plugin-based commands
- **Strategy Pattern**: Multiple discovery strategies
- **Command Pattern**: Command execution

### Data Flow

```
CLI Entry Point
    │
    ├──► Discover plugins
    ├──► Register commands
    ├──► Parse arguments
    ├──► Find command
    ├──► Execute command
    └──► Return result
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/cli-commands
```

### Basic Usage

```typescript
import { discoverManifests, registerCommands } from '@kb-labs/cli-commands';

const manifests = await discoverManifests(process.cwd());
const registry = await registerCommands(manifests);
```

## ✨ Features

```
kb-labs-cli/packages/commands/src/
├── registry/           # Plugin discovery and registration
│   ├── types.ts       # All interfaces
│   ├── availability.ts # ESM-safe dependency resolution
│   ├── discover.ts    # Workspace + node_modules discovery
│   ├── register.ts    # Manifest validation and shadowing
│   ├── run.ts         # Command execution
│   └── __tests__/     # Comprehensive test suite
├── builtins/          # Built-in commands (legacy)
└── utils/             # Utilities (logger, path helpers)
```

### Plugin Manifest v2

Commands ship as part of plugin manifests declared via ManifestV2:

```typescript
// packages/my-plugin/src/kb/manifest.ts
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  version: '0.1.0',
  display: {
    name: 'My Plugin',
    description: 'Example plugin command set',
  },
  permissions: {
    fs: { mode: 'read', allow: ['.'] },
  },
  cli: {
    commands: [
      {
        id: 'my:command',
        group: 'my',
        describe: 'My command description',
        handler: './commands/command#run',
        flags: [],
      },
    ],
  },
};
```

The CLI registry converts these declarations into internal command manifests during discovery.

### Package.json Configuration

```json
{
  "name": "@kb-labs/my-plugin",
  "exports": {
    "./kb/manifest": "./dist/kb/manifest.js"
  },
  "kb": {
    "plugin": true,
    "manifest": "./dist/kb/manifest.js"
  }
}
```

## Global Flags

All commands receive these global flags regardless of their own flag definitions:

- `--json` - JSON output mode
- `--only-available` - Filter unavailable commands (help only)
- `--no-cache` - Force discovery refresh
- `--verbose` - Detailed output
- `--quiet` - Minimal output
- `--help` - Show help
- `--version` - Show version

These flags are guaranteed to be passed through to all commands.

## Exit Codes

- **0** - Success
- **1** - Command error / invalid module
- **2** - Command unavailable (missing dependencies)

In `--json` mode with exit code 2:
```json
{
  "ok": false,
  "available": false,
  "command": "my:command",
  "reason": "Missing dependency: @kb-labs/some-dependency",
  "hint": "Run: kb devlink apply"
}
```

## Logging

The CLI respects the `KB_LOG_LEVEL` environment variable:

- `silent` - No output
- `error` - Error messages only
- `warn` - Warnings and errors (default)
- `info` - Informational messages
- `debug` - Debug information

All diagnostic output goes to `stderr`, leaving `stdout` free for command output.

## Discovery Process

1. **Workspace Discovery**: Scans `pnpm-workspace.yaml` for packages exposing `./kb/manifest` via exports or `kb.manifest`.
2. **Node Modules Discovery**: Looks through installed packages for ManifestV2 files.
3. **Explicit Paths**: Follows linked directories and CLI-provided manifest paths.
4. **Shadowing**: Workspace packages shadow node_modules packages.
5. **Caching**: Results are cached in memory (and optional adapters) for fast startup.

## Command Execution

Commands execute inside the plugin sandbox:

1. Validate ManifestV2 metadata and permissions.
2. Check availability and granted permissions.
3. Execute via `@kb-labs/plugin-adapter-cli` (sandbox runtime).
4. Record telemetry and return the exit code.

## Diagnostics

Use `kb plugins list` to see all discovered commands with their status:

- Available/unavailable status
- Source (workspace/node_modules/builtin)
- Shadowing information
- Missing dependency reasons and hints

## Development

### Running Tests

```bash
pnpm test
```

### Building

```bash
pnpm build
```

### Adding New Commands

1. Run `kb plugins scaffold my-plugin` to generate a manifest v2 skeleton.
2. Implement your command handler in `src/commands/<name>.ts`.
3. Update manifest permissions and metadata as needed.
4. Build your package and test with `kb plugins list`.

## Migration from Legacy Commands

Legacy command groups are being converted to manifest format:

1. **Built-in Commands**: Converted to manifest format in `builtins/`
2. **Product Commands**: Moved to their respective packages
3. **System Commands**: Available as standalone commands

The registry system maintains backward compatibility during the transition.

## 🔧 Configuration

### Configuration Options

No global configuration needed. Commands are discovered automatically.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level (`silent`, `error`, `warn`, `info`, `debug`)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
