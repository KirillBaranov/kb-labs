## [2.115.1] - 2026-08-01

**2 packages** bumped to v2.115.1

| Package | Previous | Bump |
|---------|----------|------|
| `@kb-labs/platform-client` | 2.115.0 | patch |
| `@kb-labs/sdk` | 2.115.0 | patch |

### 🏗️ Core & SDK

- **cli**: declare platform logging dependency

### 🌐 Gateway & API

- **gateway**: fall back to bootstrap tenant when Host resolves no tenant
- **gateway**: give the CLI a human session identity, close the /auth/register gap (#291)

### 🔌 Adapters

- **adapters**: add adapters-fs-temp as npm-publish workaround for adapters-fs 403
- **adapters**: rename npm-publish workaround to adapters-diskio, drop fs-extra/fast-glob

### 🧩 Plugins

- **release**: verify tarballs actually install, with real error messages
- **qa**: collect CI reliability evidence (#313)
- **release**: configurable build step + topo-sorted fallback (#314)
- **release**: classify npm publish errors + write GH Actions step summary on deliver failure (#305)
- **release**: plugin prepares, CI delivers — tag-driven stage/deliver split (#303)
- **release**: make root changelog output path config-driven (#290)
- **release**: collapse large package-bump tables in lockstep changelogs (#289)
- **release**: remove per-package clean install from stage
- **release**: force pnpm bundle overrides locally
- **release**: install pnpm bundle from local tarballs
- **release**: verify staged artifacts with configured package manager
- **release**: materialize unmapped workspace refs
- **release**: verify staged packages as a flow
- **release**: rewrite optional dependency protocols
- **release**: preserve workspace range operators
- **release**: normalize workspace protocols in staged tarballs
- **release**: rename verify-clean-install command to avoid kebab-case path segment
- **release**: refuse to tag when git tag version disagrees with disk
- **release**: scan devDependencies for forbidden dependency protocols
- **release**: pack stage tarballs with pnpm by default, not npm
- **release**: rewrite devDependencies workspace: refs before npm publish
- **release**: resolve cross-flow workspace: deps when staging tarballs
- **release**: publish data-store instead of blocked fs adapter
- **release**: pass flowName/tagPattern through release:git command
- **release**: move platform-client into the sdk flow as lockstep
- **marketplace**: rehash stale integrity hashes in marketplace.lock
- **release**: mark e2e delivery fixture stubs as private
- **release**: stop overwriting the root CHANGELOG.md, stage it for commit (#288)
- **qa**: fresh-install journey mismatches (kb-dev start / workflow / docs) (#287)
- **release**: push only the new tag(s), not the whole tag history (#285)
- **qa**: rename e2e-flaky CLI path segment to comply with naming convention (#286)
- **release**: rewrite a package's own version before pnpm publish (#283)
- **release**: fix no-promise-executor-return lint error in changelog test (#281)
- **release**: scope changelog LLM timeout per-group, not per-render (#280)
- **release**: resolve pnpm bundle with local overrides
- **release**: batch stage's per-package clean-install checks

### 🎨 Studio

- **studio**: fix rspack dev server ERR_CONFIG_FACTORY_TARGET_MISSING crash (#304)

### 🔧 Other

- **deploy**: build consumer-owned release images
- complete cloud deployment delivery path
- **logging**: persist aggregate platform logs
- **logging**: unify platform log context
- **kb-create**: intent-based install wizard (--intent, scenario picker)
- **ci**: reusable kb-create-install composite GitHub Action (#300)
- **kb-create**: support version-pinned plugins/services (id@version) (#298)
- **kb-create**: make default adapter packages config-driven (#299)
- **kb-create,plugin-runtime**: adapter-role validation + catalog-driven config (#296)
- **deploy**: restore provisioner executable bit (#334)
- avoid Docker Hub rate limit during deploy
- make deployment node modules self-contained
- include pnpm deploy virtual store in images
- pass adapter overrides to installer
- preserve project artifacts during lifecycle journeys
- satisfy daemon test lint
- preserve legacy service bootstrap exports
- **platform**: type logger stderr spy
- discover workflow plugins from platform root
- **logging**: satisfy lint rules
- sync workspace lockfile
- resolve dedicated binary releases
- update scaffolded command result shapes (#322)
- update plugin template command results (#321)
- unblock main CI snapshot validation (#319)
- **deploy**: use company GHCR namespace
- **deps**: scope brace-expansion security override
- **tools**: stop tracking compiled Go CLI binaries, dedupe CI build steps (#311)
- **deps**: patch high/moderate vulns found by pnpm audit
- **kb-create**: bare --yes against a manifest with no intents array
- **plugin-contracts**: derive PlatformRequirements from PluginServices (#297)
- **ci**: stabilize E2E Install Flow and clear pnpm audit findings
- **ci**: grant contents:write to e2e-platform call in ci-pr.yml (#282)
## [2.22.2] - 2026-07-25

> **@kb-labs/sdk** 2.22.1 → 2.22.2 (manual)
## [2.22.1] - 2026-07-25

> **@kb-labs/sdk** 2.22.0 → 2.22.1 (manual)
## [2.22.0] - 2026-07-03

> **@kb-labs/sdk** 2.21.2 → 2.22.0 (manual)
## [2.21.2] - 2026-04-20

> **@kb-labs/sdk** 2.21.1 → 2.21.2 (minor: new features)

### 🏗️ Core & SDK

- **cli-ui**: Enhances user experience by adding word-wrap and improved error formatting, making it easier to read and understand messages in the command line interface.
- **sdk**: Introduces a new platform client, streamlining access and integration for users, and improves the marketing page for better clarity.
- **sdk**: Provides access to adapter types, allowing developers to utilize predefined interfaces and improve consistency in their applications.
- **sdk**: Adds a runtime context for application logging and a new hook, enabling developers to better manage environment variables and enhance runtime behavior.
- **sdk**: Integrates new development dependencies to resolve local package issues, ensuring smoother development and fewer interruptions.
- **sdk**: Disables tree-shaking to prevent unnecessary import warnings, leading to a cleaner build process and less confusion for users.
- **sdk**: Suppresses warnings related to unused imports during the build process, contributing to a more polished and efficient development experience.
- **sdk**: Updates peer dependency versions to a more flexible range, preventing version conflicts and improving compatibility for users.
- **sdk**: Organizes peer dependencies for better readability and management, making it easier for developers to understand their project's requirements.
- **devkit**: Avoids complications from self-referencing dependencies in the dependency graph and corrects mock platform adapters, resulting in a more reliable development toolkit.

### 🔧 Other

- **docs**: The CLI formatting page has been relocated for easier access, helping users find relevant documentation more efficiently.
- **docs**: The next.config.ts file has been updated to a more modern format, ensuring better compatibility and performance with current tools.
- **web**: The migration of the next.config.ts file to a modern format enhances the website's performance and maintainability, ultimately improving user experience.
- **ci**: Aligning the pnpm-lock file with the updated package.json ensures that users have consistent and reliable package installations, reducing potential errors during setup.
- **general**: Resolving lint errors, test failures, and missing configurations across 10 packages improves overall software stability and reliability, leading to a smoother user experience.
## [2.21.1] - 2026-04-18

> **@kb-labs/sdk** 2.21.0 → 2.21.1 (minor: new features)

### 🏗️ Core & SDK

- **cli-ui**: Improves user interface by adding word-wrap and enhanced error formatting, making it easier to read and understand messages in the sideBorderBox.
- **sdk**: Introduces a platform client, allowing for more flexible integration with various services, alongside fixes to the marketing page for better user experience.
- **sdk**: Adds adapter types for clearer usage, enabling developers to utilize specific functionalities more effectively and reducing potential errors in implementation.
- **sdk**: Introduces the runtimeContext ALS and useEnv() hook, providing developers with better context management and environment handling during application runtime.
- **sdk**: Updates dependency handling to avoid version conflicts, ensuring smoother installations and upgrades for users without locking them into specific versions.
- **sdk**: Improves syncpack formatting for peerDependencies, enhancing the overall package management experience and ensuring better compatibility among dependencies.
- **devkit**: Optimizes the development toolkit by skipping self-referencing dependencies in the dependency graph, which simplifies dependency management and reduces potential issues with mock platform adapters.

### 🔧 Other

- **docs**: Updates the configuration file format to improve compatibility and streamline documentation, ensuring you have the most accurate guidance for setup.  
- **web**: Enhances the framework's configuration file format for better performance and future-proofing, allowing for smoother updates and improvements in your web applications.  
- **ci**: Synchronizes the package lock file with the latest dependencies, ensuring a more reliable and consistent environment during builds, which helps prevent unexpected issues.  
- **general**: Addresses various lint errors, test failures, and missing configurations across multiple packages, leading to a more stable and reliable experience for users as bugs are resolved and quality is improved.
## [2.21.0] - 2026-04-18

> **@kb-labs/sdk** 2.20.1 → 2.21.0 (minor: new features)

### 🏗️ Core & SDK

- **cli-ui**: Enhances the user interface by adding word-wrapping and improved error formatting, making it easier for users to read and understand messages within the side border box.
- **sdk**: Introduces a platform client at @kb-labs/sdk/platform, providing users with more streamlined access to platform functionalities and fixing issues on the marketing page for a better user experience.
- **sdk**: Makes adapter types accessible via @kb-labs/sdk/adapters, allowing users to integrate and utilize various components more effectively.
- **sdk**: Adds the runtimeContext ALS and useEnv() hook, offering users more flexibility and control over environment settings in their applications.
- **sdk**: Improves dependency management by sorting peerDependencies in syncpack formatting, which helps users maintain cleaner and more organized project dependencies.
- **devkit**: Prevents self-referencing dependencies in the dependency graph and fixes issues with mock platform adapters, enhancing stability and reliability for developers using the toolkit.

### 🔧 Other

- **docs**: Updates the configuration file format to improve compatibility with modern tools, ensuring smoother documentation processes for users.
- **web**: Switches to a more efficient configuration file format, which helps streamline the web application setup and enhances overall performance for end-users.
- **ci**: Aligns the dependency management files to prevent version mismatches, ensuring that users have a consistent and reliable experience when installing the software.
- **general**: Addresses various code quality issues, leading to a more stable and reliable application across multiple packages, which enhances user satisfaction and reduces potential errors.
## [2.20.1] - 2026-04-18

> **@kb-labs/sdk** 2.20.0 → 2.20.1 (minor: new features)

### 🏗️ Core & SDK

- **sdk**: Introduces a new platform client, making it easier for developers to integrate and manage platform-specific features, while also enhancing the marketing page for improved user engagement.
- **sdk**: Provides access to adapter types, simplifying the development process by allowing developers to easily implement and customize integrations.
- **sdk**: Adds a new runtime context and a `useEnv()` hook, enhancing flexibility and allowing developers to manage environment variables more effectively during runtime.
- **sdk**: Updates the formatting of peer dependencies, ensuring a cleaner and more organized package structure that improves usability for developers.
- **devkit**: Enhances dependency management by skipping self-referencing dependencies, which streamlines the development process and fixes issues with mock platform adapters for better testing.

### 🔧 Other

- **docs**: Updated the configuration file format to enhance compatibility with future updates, ensuring smoother documentation and onboarding for new users.
- **web**: Transitioned the configuration file to a new format, which improves performance and simplifies the setup process for developers working on the web application.
- **ci**: Synchronizing the package lock ensures that everyone on the team is using the same dependencies, which reduces discrepancies and errors during installations.
- **general**: Addressing various lint errors and test failures across multiple packages enhances code quality and reliability, leading to a more stable experience for all users.
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
