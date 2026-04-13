## [2.17.0] - 2026-04-13

> **@kb-labs/sdk** 2.16.0 → 2.17.0 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces the runtimeContext ALS and the useEnv() hook, allowing for more flexible and efficient environment management in applications, enhancing overall performance and user experience.
- **devkit**: Prevents self-referencing dependencies in the dependency graph and resolves issues with mock platform adapters, leading to smoother development processes and reducing potential errors during application builds.

### 🔧 Other

- **general**: Resolved various lint errors, test failures, and missing configurations across 10 packages, ensuring a smoother and more reliable user experience. This cleanup helps maintain the quality of the software, reducing the risk of unexpected issues in the future.
## [1.6.6] - 2026-04-11

> **@kb-labs/sdk** 1.6.5 → 1.6.6 (manual)
## [1.6.5] - 2026-04-11

> **@kb-labs/sdk** 1.6.4 → 1.6.5 (manual)
## [1.6.4] - 2026-04-11

> **@kb-labs/sdk** 1.6.3 → 1.6.4 (manual)
## [1.6.3] - 2026-04-11

> **@kb-labs/sdk** 1.6.2 → 1.6.3 (manual)
## [1.6.2] - 2026-04-11

> **@kb-labs/sdk** 1.6.1 → 1.6.2 (manual)
## [1.6.1] - 2026-04-11

> **@kb-labs/sdk** 1.6.0 → 1.6.1 (manual)
## [1.6.0] - 2026-04-11

> **@kb-labs/sdk** 1.5.0 → 1.6.0 (manual)
# Changelog — @kb-labs/sdk

## 1.0.0 — 2026-02-24

First stable release. Prior history represents internal R&D — this is the first versioned public release.

### Package

| Package | Version |
|---------|---------|
| `@kb-labs/sdk` | 1.0.0 |

### What's included

**`@kb-labs/sdk`** — Core SDK for building KB Labs plugins and commands. Single entry point that re-exports stable helpers from across the platform.

#### Command & Route definitions

```ts
import { defineCommand, defineRoute, defineAction, defineWebhook, defineWebSocket } from '@kb-labs/sdk'
```

- `defineCommand` — declare a CLI command handler with typed context and flags
- `defineRoute` — declare a REST API route handler
- `defineAction` — declare a workflow action
- `defineWebhook` — declare a webhook handler
- `defineWebSocket` — declare a WebSocket handler

#### Host detection

```ts
import { isCLIHost, isRESTHost, isWorkflowHost } from '@kb-labs/sdk'
```

Runtime guards to conditionally use host-specific APIs.

#### Testing

```ts
import { createTestContext } from '@kb-labs/sdk'
// or
import { createTestContext } from '@kb-labs/sdk/testing'
```

`createTestContext` — builds a mock plugin context for unit testing command handlers without a running platform.

### Notes

- `@kb-labs/sdk` is the recommended entry point for all plugin development — do not import directly from `core-*` or `plugin-*` internals
- `knowledge-core`, `knowledge-contracts`, and legacy `findNearestConfig` have been removed from SDK exports in 1.0.0 — import directly from their respective packages if needed
- `studio-contracts` re-export is a known limitation; will be resolved when Studio is refactored into a standalone package
