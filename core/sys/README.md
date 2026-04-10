# @kb-labs/core-sys

> **Core system utilities for KB Labs, including output utilities, file system operations, and repository utilities.** Provides foundational system-level functionality used across all KB Labs packages.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/core-sys** provides core system utilities for KB Labs packages. It includes output utilities, file system operations, repository utilities, and type definitions. This package is the foundation for system-level operations across the KB Labs ecosystem.

## 🏗️ Architecture

### Core Components

#### Output System

- **Purpose**: Unified output interface for CLI/runtime layers
- **Responsibilities**: User-facing messages, formatting, verbosity handling
- **Dependencies**: None (pure TypeScript)

#### File System Utilities

- **Purpose**: File system operations and path resolution
- **Responsibilities**: Absolute path resolution, file operations
- **Dependencies**: `node:fs`, `node:path`

#### Repository Utilities

- **Purpose**: Git repository operations
- **Responsibilities**: Repository root detection
- **Dependencies**: `node:fs`, `node:path`

### Design Patterns

- **Factory Pattern**: Output creation
- **Strategy Pattern**: Different output/verbosity strategies

### Data Flow

```
createOutput(config)
    │
    ├──► Resolve mode/verbosity
    ├──► Prepare output helpers
    └──► return Output
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/core-sys
```

### Basic Usage

```typescript
import { createOutput } from '@kb-labs/core-sys/output';
import { toAbsolute } from '@kb-labs/core-sys/fs';
import { findRepoRoot, discoverSubRepos } from '@kb-labs/core-sys/repo';

// Output
const out = createOutput({ verbosity: 'normal' });
out.success('Hello world');

// File System
const absPath = toAbsolute('/base', './relative');

// Repository
const repoRoot = await findRepoRoot();
const subRepos = discoverSubRepos(repoRoot); // [{ path, category, name, absolutePath }]
```

## ✨ Features

### Output

- **Unified Interface**: One Output API for CLI/runtime surfaces
- **Verbosity Modes**: quiet, normal, verbose, debug, inspect
- **Structured JSON Output**: optional machine-readable output mode

### File System

- **Path Resolution**: Convert relative to absolute paths
- **File Operations**: File system utilities

### Repository

- **Repository Detection**: Find Git repository root
- **Sub-repository Discovery**: Find all sub-repos with structured `path`, `category`, `name`, and `absolutePath` metadata

## 🔧 Configuration

### Output Configuration

Configure output via verbosity/mode flags and runtime settings.

### Environment Variables

- `KB_LOG_LEVEL`: Used by runtime/platform logger adapters (outside `core-sys`)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
