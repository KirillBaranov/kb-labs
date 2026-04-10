# Package Architecture Description: @kb-labs/shared-cli-ui

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/shared-cli-ui** provides shared CLI UI utilities for KB Labs ecosystem. It includes command suggestions, validation, multi-CLI support, formatting utilities, colors, progress indicators, and consistent UX components for all CLI applications.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide shared CLI UI utilities for consistent user experience.

**Scope Boundaries**:
- **In Scope**: Formatting, command discovery, suggestions, artifacts display
- **Out of Scope**: Command execution, file system operations

**Domain**: Shared Utilities / CLI UI

### 1.2 Key Responsibilities

1. **Formatting**: Format CLI output (tables, boxes, colors)
2. **Command Discovery**: Discover commands from manifests
3. **Command Suggestions**: Generate context-aware suggestions
4. **Artifacts Display**: Display generated artifacts

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
CLI UI Utilities
    │
    ├──► Formatting (tables, boxes, colors)
    ├──► Command Discovery (manifest parsing)
    ├──► Command Suggestions (auto-suggestions)
    ├──► Multi-CLI Support (multi-package manager)
    ├──► Artifacts Display (artifact rendering)
    └──► Debug Utilities (debug formatting)
```

### 2.2 Architectural Style

- **Style**: Utility Library with Manager Pattern
- **Rationale**: Pure utilities with stateful managers for multi-CLI

## 3. Component Architecture

### 3.1 Component: Formatting Utilities

- **Purpose**: Format CLI output
- **Responsibilities**: Tables, boxes, colors, indentation
- **Dependencies**: None (pure functions)

### 3.2 Component: Command Discovery

- **Purpose**: Discover commands from manifests
- **Responsibilities**: Parse manifests, extract commands
- **Dependencies**: None

### 3.3 Component: Multi-CLI Manager

- **Purpose**: Manage multiple CLI packages
- **Responsibilities**: Register packages, generate suggestions
- **Dependencies**: Command discovery

## 4. Data Flow

```
createCommandRegistry(commands)
    │
    ├──► Build command registry
    └──► return registry

generateSuggestions(context, registry)
    │
    ├──► Analyze context
    ├──► Match commands
    └──► return suggestions
```

## 5. Design Patterns

- **Utility Pattern**: Pure utility functions
- **Manager Pattern**: Multi-CLI manager
- **Factory Pattern**: Command runner creation

## 6. Performance Architecture

- **Time Complexity**: O(n) for most operations
- **Space Complexity**: O(n) for formatting
- **Bottlenecks**: Large table formatting

## 7. Security Architecture

- **Input Validation**: All inputs validated
- **No Side Effects**: Pure functions (mostly)
- **Path Validation**: Path operations validated

---

**Last Updated**: 2025-11-16

