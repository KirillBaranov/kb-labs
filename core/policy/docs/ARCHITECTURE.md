# Package Architecture Description: @kb-labs/core-policy

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/core-policy** implements RBAC-style permission system for KB Labs with permit-all default for good developer experience. The package provides policy resolution from preset bundles and workspace overrides, permission checking with role-based access control, and schema validation.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide RBAC permission system with permit-all default.

**Scope Boundaries**:
- **In Scope**: Policy resolution, permission checking, schema validation
- **Out of Scope**: Identity management, authentication (handled by products)

**Domain**: Core Infrastructure / Security

### 1.2 Key Responsibilities

1. **Policy Resolution**: Resolve policy from bundles and overrides
2. **Permission Checking**: RBAC evaluation
3. **Schema Validation**: Validate policy schemas

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
Policy System
    │
    ├──► Policy Resolution (preset + workspace)
    ├──► Permission Checking (RBAC)
    ├──► Schema Validation (AJV)
    └──► Permit Function Creation
```

### 2.2 Architectural Style

- **Style**: RBAC Pattern with Strategy
- **Rationale**: Role-based access control is standard and flexible

## 3. Component Architecture

### 3.1 Component: Policy Resolution

- **Purpose**: Resolve policy from preset bundles and workspace overrides
- **Responsibilities**: Load bundles, merge overrides, validate
- **Dependencies**: `core-config`, `ajv`

### 3.2 Component: Permission Checking

- **Purpose**: Check if identity has permission
- **Responsibilities**: RBAC evaluation, rule matching
- **Dependencies**: None (pure logic)

## 4. Data Flow

```
resolvePolicy({ presetBundle, workspaceOverrides })
    │
    ├──► Load preset bundle (if specified)
    ├──► Merge workspace overrides
    ├──► Validate schema
    └──► return Policy

can(policy, identity, action)
    │
    ├──► Extract roles
    ├──► Find matching rules
    ├──► Evaluate allow/deny
    └──► return boolean
```

## 5. Design Patterns

- **RBAC Pattern**: Role-based access control
- **Strategy Pattern**: Different evaluation strategies
- **Factory Pattern**: Permit function creation

## 6. Security Architecture

### 6.1 Security Model

- **Security Boundaries**: Policy rules
- **Threat Model**: Unauthorized access

### 6.2 Security Mechanisms

- **Permission Enforcement**: All operations checked
- **Explicit Deny**: Deny rules take precedence
- **Default Permit**: Permit-all default (good DX)

---

**Last Updated**: 2025-11-16

