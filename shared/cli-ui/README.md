# @kb-labs/shared-cli-ui

> **Shared CLI UI utilities for KB Labs projects - colors, formatting, progress indicators.** Provides command suggestions, validation, multi-CLI support, formatting utilities, and consistent UX components for CLI applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.0.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/shared-cli-ui** provides shared CLI UI utilities for KB Labs ecosystem. It includes command suggestions, validation, multi-CLI support, formatting utilities, colors, progress indicators, and consistent UX components for all CLI applications.

### What Problem Does This Solve?

- **CLI UX Consistency**: CLI tools need consistent UI - cli-ui provides shared components
- **Command Discovery**: Need to discover and suggest commands - cli-ui provides discovery utilities
- **Formatting**: Need consistent output formatting - cli-ui provides formatting utilities
- **Multi-CLI Support**: Need to manage multiple CLI packages - cli-ui provides multi-CLI manager

### Why Does This Package Exist?

- **Unified CLI UX**: All KB Labs CLI tools use the same UI components
- **Code Reuse**: Avoid duplicating CLI UI code
- **Consistency**: Ensure consistent user experience across CLI tools
- **Developer Experience**: Easy-to-use utilities for CLI development

### What Makes This Package Unique?

- **Comprehensive Utilities**: Wide range of CLI UI utilities
- **Multi-CLI Support**: Manage suggestions across multiple CLI packages
- **Command Discovery**: Automatic command discovery from manifests
- **Formatting**: Rich formatting utilities (tables, boxes, colors)

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/shared-cli-ui
```

### Basic Usage

```typescript
import { box, table, keyValue } from '@kb-labs/shared-cli-ui';

const output = box('Title', ['Line 1', 'Line 2']);
const tableOutput = table([['A', 'B'], ['1', '2']], ['Col1', 'Col2']);
const kvOutput = keyValue({ key: 'value' });
```

## ✨ Features

- **Command Suggestions**: Generate contextual suggestions for CLI commands
- **Command Validation**: Check if commands are available before suggesting them
- **Multi-CLI Support**: Manage suggestions across multiple CLI packages
- **Manifest Parsing**: Extract command information from CLI manifests
- **Consistent UX**: Shared UI components and styling

## Command Suggestions

### Basic Usage

```typescript
import { 
  createCommandRegistry, 
  generateDevlinkSuggestions 
} from '@kb-labs/shared-cli-ui';

// Create a registry of available commands
const registry = createCommandRegistry([
  'devlink:apply',
  'devlink:clean',
  'devlink:plan'
]);

// Generate suggestions based on warnings
const suggestions = generateDevlinkSuggestions(
  new Set(['LOCK_MISMATCH']),
  { undo: { available: true } },
  registry
);
```

### Multi-CLI Integration

```typescript
import { MultiCLISuggestions } from '@kb-labs/shared-cli-ui';

// Create a multi-CLI manager
const manager = new MultiCLISuggestions();

// Register your CLI package
manager.registerPackage({
  name: 'my-cli',
  group: 'my-cli',
  commands: myCommands,
  priority: 80
});

// Generate suggestions from all registered packages
const suggestions = manager.generateAllSuggestions({
  warningCodes: new Set(['MY_WARNING']),
  undo: { available: true }
});
```

## Integration Guide

### 1. Create CLI Suggestions Module

Create a `cli-suggestions.ts` file in your CLI package:

```typescript
import { 
  MultiCLISuggestions, 
  type CommandSuggestion 
} from '@kb-labs/shared-cli-ui';
import { commands } from './cli.manifest.js';

export function generateMyCLISuggestions(
  warningCodes: Set<string>,
  context: any
): CommandSuggestion[] {
  const suggestions: CommandSuggestion[] = [];

  if (warningCodes.has('MY_WARNING')) {
    suggestions.push({
      id: 'MY_COMMAND',
      command: 'kb my-cli command',
      args: [],
      description: 'Execute my command',
      impact: 'safe',
      when: 'MY_WARNING',
      available: true
    });
  }

  return suggestions;
}

export function createMyCLISuggestions(): MultiCLISuggestions {
  const manager = new MultiCLISuggestions();
  
  manager.registerPackage({
    name: 'my-cli',
    group: 'my-cli',
    commands,
    priority: 80
  });

  return manager;
}
```

### 2. Register with Main CLI

In your main CLI (e.g., devlink), register the package:

```typescript
import { MultiCLISuggestions } from '@kb-labs/shared-cli-ui';
import { createMyCLISuggestions } from '@kb-labs/my-cli/cli-suggestions';

const multiCLI = new MultiCLISuggestions();

// Register all CLI packages
multiCLI.registerPackage(devlinkPackage);
multiCLI.registerPackage(myCLIPackage);

// Generate suggestions
const suggestions = multiCLI.generateAllSuggestions(context);
```

### 3. Command Priority

Set priority for your CLI package:
- **100**: Core tools (devlink)
- **80**: Important tools (mind)
- **70**: Utility tools (tox)
- **50**: Optional tools (ai-review)

## API Reference

### CommandSuggestion

```typescript
interface CommandSuggestion {
  id: string;
  command: string;
  args: string[];
  description: string;
  impact: 'safe' | 'disruptive';
  when: string;
  available?: boolean;
}
```

### MultiCLISuggestions

```typescript
class MultiCLISuggestions {
  registerPackage(pkg: CLIPackage): void;
  generateAllSuggestions(context: MultiCLIContext): CommandSuggestion[];
  generateGroupSuggestions(group: string, context: MultiCLIContext): CommandSuggestion[];
  getAvailableCommands(group: string): string[];
}
```

### Command Registry

```typescript
function createCommandRegistry(commands: string[]): CommandRegistry;
function isCommandAvailable(command: string, registry: CommandRegistry): boolean;
function validateSuggestions(suggestions: CommandSuggestion[], registry: CommandRegistry): CommandSuggestion[];
```

## Artifacts Display

The artifacts display system provides consistent, beautiful display of generated files and artifacts across all CLI commands.

### Features

- **Consistent Formatting**: Unified display format across all CLI packages
- **Multiple Display Modes**: Compact, detailed, and grouped views
- **Smart Sorting**: By time (newest first) by default, with type and custom options
- **Size & Time Info**: Human-readable file sizes and relative timestamps
- **Path Normalization**: Shows relative paths for better readability
- **Federal Sorting**: All CLI packages automatically get time-based sorting

### Usage

```typescript
import { 
  displayArtifacts,
  displayArtifactsCompact,
  displaySingleArtifact,
  type ArtifactInfo 
} from '@kb-labs/shared-cli-ui';

// Define artifacts
const artifacts: ArtifactInfo[] = [
  {
    name: 'Plan',
    path: '/path/to/.kb/devlink/last-plan.json',
    size: 1024,
    modified: new Date(),
    description: 'Last generated plan'
  },
  {
    name: 'Lock',
    path: '/path/to/.kb/devlink/lock.json',
    size: 2048,
    modified: new Date(Date.now() - 3600000),
    description: 'Dependency lock file'
  }
];

// Display in compact format (for status-like displays)
const compactDisplay = displayArtifactsCompact(artifacts, { 
  maxItems: 5,
  showSize: true 
});

// Display with full details
const fullDisplay = displayArtifacts(artifacts, {
  showSize: true,
  showTime: true,
  showDescription: true,
  maxItems: 10,
  title: 'Generated Files',
  groupBy: 'type'
});

// Display single artifact
const singleDisplay = displaySingleArtifact(artifacts[0], 'Latest Artifact');
```

### Display Options

```typescript
interface ArtifactDisplayOptions {
  showSize?: boolean;        // Show file sizes (default: true)
  showTime?: boolean;        // Show modification times (default: true)
  showDescription?: boolean; // Show descriptions (default: false)
  maxItems?: number;         // Maximum items to show (default: 10)
  title?: string;            // Section title (default: 'Generated Artifacts')
  groupBy?: 'none' | 'type' | 'time'; // Grouping strategy (default: 'none')
}
```

### Integration in CLI Commands

```typescript
import { displayArtifactsCompact } from '@kb-labs/shared-cli-ui';
import { discoverArtifacts } from './my-artifact-discovery';

export const run: CommandModule['run'] = async (ctx, _argv, flags) => {
  // ... your command logic ...
  
  // Show artifacts after operation
  const artifacts = await discoverArtifacts(process.cwd());
  const artifactsInfo = displayArtifactsCompact(artifacts, { maxItems: 5 });
  
  const output = box('My Command', [
    ...summary,
    ...artifactsInfo
  ]);
  
  ctx.presenter.write(output);
};
```

## 📦 API Reference

### Main Exports

#### Formatting Functions

- `box(title, content)`: Create boxed section
- `table(rows, headers?)`: Format table
- `keyValue(pairs, options?)`: Format key-value pairs
- `indent(lines, level?)`: Add indentation
- `section(header, content)`: Create section

#### Command Utilities

- `createCommandRegistry(commands)`: Create command registry
- `MultiCLISuggestions`: Multi-CLI manager class
- `displayArtifacts(artifacts, options?)`: Display artifacts
- `displayArtifactsCompact(artifacts, options?)`: Compact artifact display

### Types & Interfaces

See detailed API documentation in code comments.

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
