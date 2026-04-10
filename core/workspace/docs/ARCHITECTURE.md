# Package Architecture Description: @kb-labs/core-workspace

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/core-workspace** provides workspace utilities for KB Labs internal tooling. It resolves workspace root directory by detecting workspace markers (`.git`, `pnpm-workspace.yaml`, `package.json`) and provides workspace metadata.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide workspace root resolution utilities for internal tooling.

**Scope Boundaries**:
- **In Scope**: Workspace root resolution, marker detection
- **Out of Scope**: Workspace operations, package management

**Domain**: Core Infrastructure / Workspace Utilities

### 1.2 Key Responsibilities

1. **Workspace Detection**: Detect workspace root via markers
2. **Root Resolution**: Resolve workspace root directory
3. **Metadata**: Provide workspace filesystem information

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
Workspace Utilities
    │
    └──► Workspace Root Resolution (detect markers)
```

### 2.2 Architectural Style

- **Style**: Utility Pattern
- **Rationale**: Simple utility functions for workspace detection

## 3. Component Architecture

### 3.1 Component: Workspace Root Resolver

- **Purpose**: Resolve workspace root directory
- **Responsibilities**: Detect markers, return root path
- **Dependencies**: `core-sys` for repository utilities

## 4. Data Flow

```
resolveWorkspaceRoot({ startDir, stopDir })
    │
    ├──► Walk up directory tree
    ├──► Check for markers
    └──► Return workspace root
```

## 5. Design Patterns

- **Utility Pattern**: Pure utility functions
- **Strategy Pattern**: Multiple detection strategies

## 6. Performance Architecture

- **Time Complexity**: O(n) where n = directory depth
- **Space Complexity**: O(1)
- **Bottlenecks**: File system access

## 7. Security Architecture

- **Path Validation**: All paths validated
- **No Side Effects**: Pure functions

---

**Last Updated**: 2025-11-16

