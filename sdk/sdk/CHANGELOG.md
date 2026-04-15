## [2.20.0] - 2026-04-15

> **@kb-labs/sdk** 2.19.0 → 2.20.0 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces the platform client at @kb-labs/sdk/platform, enhancing accessibility to platform features and improving the marketing page for better user engagement.
- **sdk**: Adds adapter types via @kb-labs/sdk/adapters, allowing for more flexible integrations and easier customization to fit user needs.
- **sdk**: Introduces the runtimeContext ALS and useEnv() hook, providing developers with improved context management and enabling more efficient resource handling in applications.
- **devkit**: Implements a skip for self-referencing dependencies in the dependency graph, streamlining development processes and fixing mock platform adapters for better testing reliability.

### 🔧 Other

- **docs**: Updated the configuration file format, ensuring better compatibility with future updates and improving documentation clarity for users.  
- **web**: Migrated the configuration file to a new format, which enhances performance and allows for easier customization options for developers.  
- **ci**: Aligned package management files to ensure consistent dependencies, leading to a more reliable and smoother installation process for users.  
- **general**: Resolved various code quality issues, resulting in a more stable and reliable software experience across multiple packages.
## [2.19.0] - 2026-04-15

> **@kb-labs/sdk** 2.18.2 → 2.19.0 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Users can now easily access adapter types through `@kb-labs/sdk/adapters`, simplifying the integration process and enhancing code clarity.  
- **sdk**: The addition of the `runtimeContext` ALS and `useEnv()` hook provides developers with better context awareness and environment management, leading to more efficient applications.  
- **devkit**: By skipping self-referencing dependencies in the dependency graph and fixing mock platform adapters, users will experience improved performance and reliability in their development workflows.

### 🔧 Other

- **docs**: Updates the configuration file format to improve compatibility and maintainability, ensuring smoother documentation for developers.
- **web**: Shifts the configuration file to a more modern format, enhancing performance and future-proofing our web applications for better user experiences.
- **ci**: Synchronizes the package lock file with the updated project dependencies, which helps prevent unexpected issues during installation and deployment.
- **general**: Fixes various issues related to code quality and functionality across multiple packages, leading to a more reliable and stable software performance for users.
## [2.18.2] - 2026-04-14

> **@kb-labs/sdk** 2.18.1 → 2.18.2 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces the runtimeContext ALS and useEnv() hook, enhancing the flexibility and efficiency of environment management in your applications.
- **devkit**: Improves dependency handling by skipping self-referencing dependencies in the dependency graph, resulting in cleaner project structures and easier maintenance.

### 🔧 Other

- **general**: Cleans up code by resolving lint errors and test failures, ensuring a more reliable and maintainable codebase across all packages. This leads to a smoother user experience and reduces the likelihood of unexpected issues in the future.
## [2.18.1] - 2026-04-14

> **@kb-labs/sdk** 2.18.0 → 2.18.1 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces the runtimeContext ALS and useEnv() hook, allowing developers to easily manage and access runtime environments, which simplifies the process of configuring applications for different deployment scenarios.
- **devkit**: Enhances dependency management by skipping self-referencing dependencies in the Directed Acyclic Graph (DAG) and fixing mock platform adapters, resulting in a more efficient development experience and reducing potential errors during integration.

### 🔧 Other

- **general**: Cleans up various issues across multiple packages, ensuring a smoother and more reliable experience for users by eliminating errors and improving overall functionality.
## [2.18.0] - 2026-04-14

> **@kb-labs/sdk** 2.17.0 → 2.18.0 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces the `runtimeContext` ALS and `useEnv()` hook, enhancing the flexibility and ease of managing environment variables for developers, leading to more efficient application configurations.
- **devkit**: Implements a solution to skip self-referencing dependencies in the dependency graph, improving build performance and reducing complexity, while also fixing issues with mock platform adapters to ensure smoother testing experiences.

### 🔧 Other

- **general**: Improves overall code quality by resolving various lint errors, ensuring a more stable and reliable experience for users across all packages. This also helps prevent potential issues in future updates.
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
