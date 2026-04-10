# Architecture Boundaries — Audit Report

> Generated: 2026-03-17

## Current Cross-Category Dependencies

### platform → infra (32 deps) — EXPECTED
Platform depends on infra layer (plugin system, adapters). This is by design.

Key dependencies:
- `core-runtime` → `plugin-execution-factory`
- `core-sandbox` → `plugin-runtime`
- `cli-bin` → `plugin-contracts`
- `sdk` → `plugin-contracts` (re-exports types)
- `rest-api-app` → `plugin-execution`, `plugin-contracts`
- `workflow-runtime` → `plugin-execution`, `plugin-contracts`

### infra → platform (37 deps) — EXPECTED
Infra layer depends on platform core types and contracts. Bidirectional — tightly coupled.

Key dependencies:
- `plugin-contracts` → `core-platform`
- `plugin-execution` → `core-contracts`, `core-ipc`
- `gateway-app` → `core-runtime`, `core-platform`, `core-config`
- `adapters-*` → `core-platform` (adapter manifests)

### plugins → platform (28 deps) — NEEDS CLEANUP
Most go through SDK (correct), but some bypass it:

**Through SDK (correct):**
- `agent-cli` → `sdk`
- `agent-core` → `sdk`
- `mind-core` → `sdk`
- `devlink-core` → `sdk`

**Bypassing SDK (violations):**
- `agent-core` → `shared-testing` (dead dep, no imports in code)
- `agent-tools` → `core-platform` (direct platform access)
- `commit-core` → `core-platform` (direct platform access)
- `mind-cli` → `shared-cli-ui` (UI helpers not in SDK)
- `studio-data-client` types used by plugins (contracts packages)

### plugins → infra (9 deps) — NEEDS CLEANUP
Plugins importing infra internals directly:

- `agent-cli` → `plugin-runtime` (dead dep, no imports in code)
- `mind-cli` → `plugin-contracts` (types only)
- `quality-cli` → `plugin-contracts`, `plugin-runtime`
- `release-manager-checks` → `plugin-contracts`

### platform → plugins (9 deps) — QUESTIONABLE
Platform depending on plugin contracts (studio-data-client imports):

- `studio-data-client` → `agent-contracts`, `commit-contracts`, `qa-contracts`, `quality-contracts`, `release-manager-contracts`

This is Studio importing plugin types to render plugin-specific UIs. May need abstraction.

### templates → infra (2 deps) — VIOLATION
- `plugin-template-core` → `plugin-contracts`, `plugin-runtime`

Should only depend on `@kb-labs/sdk`.

## Proposed Boundary Rules

```
Category                        | Allowed Dependencies
--------------------------------|------------------------------------------
platform/                       | platform/* + infra/*
infra/                          | infra/* + platform/*
plugins/                        | @kb-labs/sdk ONLY + own internal packages
templates/kb-labs-plugin-template  | @kb-labs/sdk ONLY
templates/kb-labs-product-template | platform/* + infra/* (mini-platform)
sites/                          | unrestricted (not part of platform)
```

## Violations to Fix

### Priority 1: Dead dependencies (remove from package.json)
- `plugins/kb-labs-agents/agent-cli` → `@kb-labs/plugin-runtime` (unused)
- `plugins/kb-labs-agents/agent-core` → `@kb-labs/shared-testing` (unused)

### Priority 2: SDK gaps (add to SDK, then remove direct deps)
These packages import platform internals because SDK doesn't export what they need:

| Plugin package | Imports | What's needed in SDK |
|---------------|---------|---------------------|
| `agent-tools` | `core-platform` | Platform type access |
| `commit-core` | `core-platform` | Platform singleton |
| `mind-cli` | `shared-cli-ui` | UI helpers (colors, spinners) |
| `mind-cli` | `plugin-contracts` | PluginContext types |
| `quality-cli` | `plugin-contracts` | Manifest types |
| `quality-cli` | `plugin-runtime` | Runtime access |

### Priority 3: Template cleanup
- `plugin-template-core` → remove `plugin-contracts`, `plugin-runtime` deps, use `@kb-labs/sdk` only
- `product-template` → allowed to use `infra/*` + `platform/*` (it's a mini-platform, not a plugin)

### Priority 4: Studio reverse dependency
- `studio-data-client` imports plugin contracts
- Consider: plugin-agnostic data layer, or accept this coupling

## ESLint Presets

| Preset | Category | File |
|--------|----------|------|
| `node.js` | platform, infra | `devkit/eslint/node.js` |
| `plugin.js` | plugins, templates | `devkit/eslint/plugin.js` ✅ Done |
| `react.js` | studio, sites | `devkit/eslint/react.js` |

## Action Items

1. Remove dead deps (Priority 1) — trivial, do now
2. Expand SDK exports (Priority 2) — medium effort, unblocks plugin isolation
3. Fix template deps (Priority 3) — small effort
4. Decide on Studio coupling (Priority 4) — architectural decision
5. Add `infra.js` preset if platform→infra rules needed — future
