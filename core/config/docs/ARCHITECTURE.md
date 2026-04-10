# Package Architecture Description: @kb-labs/core-config

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/core-config** implements a sophisticated 6-layer configuration merging system for KB Labs products. It provides deterministic configuration resolution with comprehensive tracing, supporting both YAML and JSON formats, LRU caching for performance, and Profiles v2 integration. The package uses a layered architecture pattern to merge configuration from multiple sources (runtime defaults, profiles, presets, workspace, local, CLI) into a unified configuration object.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide 6-layer configuration resolution system with deterministic merging and comprehensive tracing.

**Scope Boundaries**:
- **In Scope**: Configuration file reading, 6-layer merging, profile resolution, preset resolution, caching, tracing
- **Out of Scope**: Profile loading implementation (delegated to core-profiles), policy enforcement (delegated to core-policy)

**Domain**: Core Infrastructure / Configuration Management

### 1.2 Key Responsibilities

1. **6-Layer Merging**: Merge configuration from 6 sources deterministically
2. **File System Operations**: Read and parse YAML/JSON config files
3. **Profile Resolution**: Resolve Profiles v2 with extends and scopes
4. **Preset Resolution**: Resolve org preset packages
5. **Caching**: LRU cache for file system reads
6. **Tracing**: Generate detailed merge traces for debugging

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
Configuration Resolution
    │
    ├──► Layer 1: Runtime Defaults
    ├──► Layer 2: Profile Defaults (from core-profiles)
    ├──► Layer 3: Preset Defaults (from npm)
    ├──► Layer 4: Workspace Config (kb-labs.config.*)
    ├──► Layer 5: Local Config (.kb/<product>/config.json)
    └──► Layer 6: CLI Overrides
            │
            ▼
    layeredMergeWithTrace()
            │
            ▼
    Merged Config + Trace
```

### 2.2 Architectural Style

- **Style**: Layered Architecture with Strategy Pattern
- **Rationale**: 6-layer system allows flexible configuration override hierarchy

### 2.3 Core Principles

1. **Deterministic Merging**: Same inputs always produce same output
2. **Comprehensive Tracing**: Every merge step is traced
3. **Performance**: LRU caching for file reads
4. **Format Flexibility**: Support YAML and JSON

## 3. Component Architecture

### 3.1 Component: `product-config.ts`

- **Purpose**: Main configuration resolver
- **Responsibilities**: Coordinate 6-layer merge, return config + trace
- **Dependencies**: merge, cache, profiles, preset modules

### 3.2 Component: `layered-merge.ts`

- **Purpose**: Merge configuration layers with tracing
- **Responsibilities**: Deep merge objects, track operations, generate trace
- **Dependencies**: None (pure function)

### 3.3 Component: `fs-cache.ts`

- **Purpose**: LRU cache for file system reads
- **Responsibilities**: Cache file reads, invalidate on change
- **Dependencies**: node:fs

### 3.4 Component: Profile Resolution (`profiles/`)

- **Purpose**: Resolve Profiles v2
- **Responsibilities**: Load profiles, resolve extends, select scopes
- **Dependencies**: zod for validation

## 4. Data Flow

```
getProductConfig()
    │
    ├──► findNearestConfig() → workspace root
    ├──► readWorkspaceConfig() → workspace config (cached)
    ├──► resolveProfile() → profile defaults
    ├──► resolvePreset() → preset defaults
    ├──► readLocalConfig() → local config (cached)
    ├──► layeredMergeWithTrace() → merged config + trace
    └──► return { config, trace }
```

## 5. Design Patterns

- **Layered Architecture**: 6-layer configuration system
- **Strategy Pattern**: Different merge strategies
- **Cache Pattern**: LRU cache for performance
- **Builder Pattern**: Configuration built layer by layer

## 6. State Management

- **State Type**: Local + cached (LRU)
- **State Storage**: Memory (LRU cache)
- **State Lifecycle**: Created per call, cached for performance

## 7. Performance Architecture

- **Time Complexity**: O(n) where n = layers + profile depth
- **Space Complexity**: O(m) where m = cached config size
- **Caching**: LRU cache (100 entries) for file reads

## 8. Security Architecture

- **Input Validation**: Zod schemas
- **Path Traversal**: Workspace root validation
- **File System**: Atomic writes

---

**Last Updated**: 2025-11-16

