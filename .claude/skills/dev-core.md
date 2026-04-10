---
name: dev-core
description: Core platform, SDK, and shared package development conventions
globs:
  - "core/**"
  - "sdk/**"
  - "shared/**"
---

# Core Development

## Layer 0 Rules

Packages in `core/` are the foundation. They MUST NOT depend on:
- `sdk/`
- `plugins/`
- `adapters/`
- `studio/`

Core packages may depend on each other (within core/).

## Package Categories

### Types & Contracts (`core/types/`, `core/contracts/`)
- Pure type definitions, zero runtime code
- Every other package depends on these

### Platform (`core/platform/`)
- Singleton wrappers: `platform.logger`, `platform.cache`
- Always use `ILogger`/`ICache` interfaces from here
- Use `platform.logger` for noop logger (not `console.log`)

### Plugin System (`core/plugin-*`)
- `plugin-contracts` — manifest types, lifecycle interfaces
- `plugin-runtime` — plugin loading, registration
- `plugin-execution` — execution backends (in-process, worker-pool, container)
- `plugin-execution-factory` — routing backend, provisioning

### Runtime (`core/runtime/`)
- Platform lifecycle, DI container, config loading
- Entry point for platform bootstrap

## SDK Development (`sdk/`)

SDK is the **public API** for plugin authors.
- Composables: `useCache()`, `useLLM()`, `useLogger()`
- Must be stable — breaking changes require major version bump
- Only depends on `core/` (Layer 0 → Layer 1)

## Shared Utilities (`shared/`)

- `cli-ui` — spinners, tables, prompts (used by CLI + plugins)
- `http` — Fastify helpers, OpenAPI integration
- `testing` — test utilities, fixtures
- `command-kit` — command registration helpers
- `tool-kit` — general utilities
