# Fixture: Monorepo

This is a monorepo fixture that demonstrates how to use `@kb-labs/devkit` presets across multiple packages in a workspace. It showcases real-world monorepo patterns and inter-package dependencies.

## Purpose

This fixture validates that DevKit presets work correctly in a monorepo context, including:
- Multiple packages with different configurations
- Inter-package dependencies and workspace references
- Shared tooling across packages
- Consistent linting, formatting, and testing

## Structure

```
packages/
├── shared/          # Shared utilities package
│   ├── src/         # Logger, ConfigManager, validation utilities
│   └── tests/       # Tests for shared functionality
└── app/             # Application package
    ├── src/         # UserService, App classes
    └── tests/       # Tests for application logic
```

## Configuration

Each package uses DevKit presets:

- **TypeScript**: `@kb-labs/devkit/tsconfig/lib.json` (shared) and `@kb-labs/devkit/tsconfig/node.json` (app)
- **ESLint**: `@kb-labs/devkit/eslint/node.js` - Consistent linting across packages
- **Prettier**: `@kb-labs/devkit/prettier/index.json` - Shared formatting
- **Vitest**: `@kb-labs/devkit/vitest/node.js` - Test configuration
- **Tsup**: `@kb-labs/devkit/tsup/node.js` - Build configuration

## Features

- **Workspace Management**: pnpm workspace with proper package references
- **Shared Dependencies**: `@fixture/app` depends on `@fixture/shared`
- **Consistent Tooling**: All packages use the same DevKit presets
- **Type Safety**: Full TypeScript support across packages
- **Testing**: Comprehensive test coverage for both packages

## Usage

This fixture is automatically validated by DevKit's CI pipeline. To run validation locally:

```bash
# From DevKit root
pnpm fixtures:monorepo:bootstrap  # Install dependencies
pnpm fixtures:monorepo:check      # Run all validation checks
```

## Monorepo Patterns

- **Workspace References**: `workspace:*` for internal dependencies
- **Shared Configuration**: Consistent tooling across all packages
- **Independent Builds**: Each package can be built independently
- **Cross-Package Testing**: Tests can import from other packages
- **Type Safety**: Full TypeScript support with proper module resolution
