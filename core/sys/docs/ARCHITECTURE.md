# Package Architecture Description: @kb-labs/core-sys

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/core-sys** provides core system utilities for KB Labs packages including structured logging with multiple sinks, file system operations, repository utilities, and type definitions. The package is foundational infrastructure used across all KB Labs packages.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide core system utilities for KB Labs packages.

**Scope Boundaries**:
- **In Scope**: Logging, file system, repository utilities, types
- **Out of Scope**: CLI formatting, product-specific logic

**Domain**: Core Infrastructure / System Utilities

### 1.2 Key Responsibilities

1. **Structured Logging**: Multiple sinks, redaction, environment configuration
2. **File System**: Path resolution, file operations
3. **Repository**: Git repository root detection
4. **Types**: Shared type definitions

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
System Utilities
    │
    ├──► Logging (structured, multiple sinks)
    ├──► File System (path resolution)
    ├──► Repository (Git root detection)
    └──► Types (shared types)
```

### 2.2 Architectural Style

- **Style**: Utility Library with Sink Pattern
- **Rationale**: System utilities should be simple and focused

## 3. Component Architecture

### 3.1 Component: Logging

- **Purpose**: Structured logging with multiple sinks
- **Responsibilities**: Log formatting, sink management, redaction
- **Dependencies**: None (pure TypeScript)

### 3.2 Component: File System

- **Purpose**: File system operations
- **Responsibilities**: Path resolution
- **Dependencies**: `node:fs`, `node:path`

### 3.3 Component: Repository

- **Purpose**: Git repository operations
- **Responsibilities**: Repository root detection
- **Dependencies**: `node:fs`, `node:path`

## 4. Data Flow

```
getLogger(category)
    │
    ├──► Create logger instance
    ├──► Configure from environment
    └──► return Logger

log.info(message, context)
    │
    ├──► Check log level
    ├──► Format message
    ├──► Redact sensitive data
    ├──► Send to sinks
    └──► return void
```

## 5. Design Patterns

- **Sink Pattern**: Multiple logging sinks
- **Factory Pattern**: Logger creation
- **Strategy Pattern**: Different logging strategies

## 6. Security Architecture

### 6.1 Security Model

- **Security Boundaries**: Path validation
- **Threat Model**: Path traversal, sensitive data exposure

### 6.2 Security Mechanisms

- **Path Validation**: Absolute path resolution prevents traversal
- **Redaction**: Sensitive data redaction in logs

---

**Last Updated**: 2025-11-16

