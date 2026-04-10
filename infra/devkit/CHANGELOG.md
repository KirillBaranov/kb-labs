## [1.4.0] - 2026-04-06

> **@kb-labs/devkit** 1.3.0 → 1.4.0 (minor: new features)

### ✨ New Features

- **tsup/node**: Automatically identifies entry points from the package.json exports, simplifying the setup process for developers and enhancing project organization.
- **general**: Introduces the `isPolicyPassing` utility function in policy-contracts, allowing users to easily check if a policy has been successfully met, streamlining decision-making (#1).
- **eslint**: Adds a preset export for plugins with boundary enforcement, helping developers maintain code quality and structure by providing clear guidelines for architectural integrity.
- **eslint**: Introduces a plugin preset that enforces architectural boundaries, ensuring that code adheres to established design principles, which can lead to better maintainability and fewer bugs.
- **tsup**: Includes dts output in all preset configurations and extends eslint, ensuring that types are properly defined and synchronized, which enhances type safety and developer experience.

### 🐛 Bug Fixes

- **general**: Enhances the TypeScript configuration for Node.js, helping developers avoid type errors and improving code quality across shared projects.
## [1.3.0] - 2026-04-06

> **@kb-labs/devkit** 1.2.0 → 1.3.0 (minor: new features)

### ✨ New Features

- **tsup/node**: Automatically derives entry points from the package.json exports, simplifying the configuration process for developers and reducing the chance of errors.
- **general**: Introduces the `isPolicyPassing` utility function to the policy-contracts, allowing users to easily check if a policy is met, enhancing decision-making in applications (#1).
- **eslint**: Adds a plugin preset export with boundary enforcement, helping developers maintain code quality by ensuring adherence to architectural guidelines.
- **eslint**: Introduces a plugin preset specifically designed for architectural boundary enforcement, which aids in keeping projects organized and maintainable.
- **tsup**: Includes dts output in all preset configurations and extends eslint for better integration, providing a smoother development experience and improved type safety.

### 🐛 Bug Fixes

- **general**: Adds type definitions for Node.js in the shared TypeScript configuration, enhancing code reliability and reducing errors during development.
## [1.2.0] - 2026-04-06

> **@kb-labs/devkit** 1.1.0 → 1.2.0 (minor: new features)

### ✨ New Features

- **tsup/node**: Automatically derives entry points from the package.json exports, simplifying project setup and reducing configuration errors for developers.
- **general**: Introduces an `isPolicyPassing` utility function to the policy-contracts, allowing users to easily check if a given policy check has passed, enhancing decision-making in applications (#1).
- **eslint**: Adds a plugin preset export that enforces architectural boundaries, helping teams maintain code quality and structure across large projects.
- **eslint**: Introduces a new plugin preset focused on architectural boundary enforcement, ensuring that code adheres to design principles for better maintainability.
- **tsup**: Enhances output options by adding dts files to all preset configurations, improving TypeScript support and making it easier to manage type definitions across projects.

### 🐛 Bug Fixes

- **general**: Enhances compatibility with Node.js by adding type definitions, ensuring smoother integration and fewer runtime errors for users relying on TypeScript.
## [1.1.0] - 2026-04-06

> **@kb-labs/devkit** 1.0.0 → 1.1.0 (minor: new features)

### ✨ New Features

- **tsup/node**: Automatically derives entry points from package.json exports, simplifying the build process for developers and reducing potential configuration errors.
- **general**: Introduces the `isPolicyPassing` utility function, which helps users easily determine if their policy checks are successful, enhancing the reliability of policy management (#1).
- **eslint**: Adds a plugin preset export that enforces code boundaries, promoting best practices and maintaining code quality across projects.
- **eslint**: Implements architectural boundary enforcement in the plugin preset, ensuring that developers adhere to design principles, which helps prevent architectural drift.
- **tsup**: Adds TypeScript declaration file (dts) output to all preset configurations, improving type support and making it easier for developers to integrate and use the presets in their projects.

### 🐛 Bug Fixes

- **general**: Enhances compatibility with Node.js environments by specifying type definitions, ensuring smoother development experiences and reducing potential errors.
## [1.1.0] - 2026-03-04

> **@kb-labs/devkit** 1.0.0 → 1.1.0 (manual)
