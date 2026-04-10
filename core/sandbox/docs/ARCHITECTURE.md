# Package Architecture Description: @kb-labs/sandbox

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/sandbox** provides universal sandbox isolation system for executing untrusted code in KB Labs ecosystem. It supports both fork-based isolation (subprocess) and in-process execution modes, with resource limits, monitoring, and comprehensive security controls.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide secure execution environment for untrusted code with isolation and resource limits.

**Scope Boundaries**:
- **In Scope**: Execution isolation, resource limits, monitoring, security controls
- **Out of Scope**: Code compilation, language runtime (handled by Node.js)

**Domain**: Core Infrastructure / Security

### 1.2 Key Responsibilities

1. **Execution Isolation**: Execute code in isolated environment
2. **Resource Management**: Enforce CPU, memory, and timeout limits
3. **Security Controls**: Environment filtering, filesystem restrictions
4. **Monitoring**: Collect logs, metrics, and traces

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
Sandbox System
    │
    ├──► Execution Modes (subprocess/in-process)
    ├──► Resource Limits (CPU, memory, timeout)
    ├──► Security Controls (env, filesystem, network)
    ├──► Monitoring (logs, metrics, traces)
    └──► Lifecycle Hooks
```

### 2.2 Architectural Style

- **Style**: Strategy Pattern with Factory
- **Rationale**: Different execution strategies for different use cases

## 3. Component Architecture

### 3.1 Component: Sandbox Runner

- **Purpose**: Execute code in isolated environment
- **Responsibilities**: Resource management, security enforcement, monitoring
- **Dependencies**: None (pure Node.js)

### 3.2 Component: Execution Modes

- **Subprocess Mode**: Fork-based isolation
- **In-Process Mode**: Fast execution for development

### 3.3 Component: Monitoring System

- **Purpose**: Collect execution data
- **Responsibilities**: Log collection, metrics tracking, trace collection
- **Dependencies**: None

## 4. Data Flow

```
createSandboxRunner(config)
    │
    ├──► Create runner (subprocess or in-process)
    ├──► Configure resource limits
    ├──► Setup security controls
    └──► return SandboxRunner

sandbox.run(handler, input, context)
    │
    ├──► Validate preflight checks
    ├──► Setup resource limits
    ├──► Execute handler
    ├──► Collect logs/metrics/traces
    └──► return ExecutionResult
```

## 5. Design Patterns

- **Strategy Pattern**: Different execution strategies
- **Factory Pattern**: Sandbox runner creation
- **Observer Pattern**: Lifecycle hooks

## 6. Security Architecture

### 6.1 Security Model

- **Security Boundaries**: Process isolation (subprocess mode)
- **Threat Model**: Malicious code execution, resource exhaustion

### 6.2 Security Mechanisms

- **Process Isolation**: Separate process space
- **Environment Filtering**: Whitelisted environment variables
- **Resource Limits**: Memory and CPU quotas
- **Timeout Protection**: Automatic termination

---

**Last Updated**: 2025-11-16

