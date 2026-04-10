# Fixture: TypeScript Library

This is a minimal TypeScript library fixture that consumes `@kb-labs/devkit` presets. It serves as a validation tool to ensure DevKit changes don't break downstream consumers.

## Purpose

This fixture validates that DevKit presets work correctly in a real-world TypeScript library setup. It's used in CI to catch breaking changes before they affect actual consumer projects.

## Configuration

This fixture uses the following DevKit presets:

- **TypeScript**: `@kb-labs/devkit/tsconfig/lib.json` - Library-specific TypeScript configuration
- **ESLint**: `@kb-labs/devkit/eslint/node.js` - ESLint 9 flat config with TypeScript support
- **Prettier**: `@kb-labs/devkit/prettier/index.json` - Shared formatting configuration
- **Vitest**: `@kb-labs/devkit/vitest/node.js` - Test configuration with Node environment
- **Tsup**: `@kb-labs/devkit/tsup/node.js` - ESM-only build configuration

## Usage

This fixture is automatically validated by DevKit's CI pipeline. To run validation locally:

```bash
# From DevKit root
pnpm fixtures:bootstrap  # Install dependencies
pnpm fixtures:check      # Run all validation checks
```

## Structure

- `src/index.ts` - Simple library entry point
- `tests/smoke.spec.ts` - Basic smoke test
- `types/devkit.d.ts` - TypeScript declarations for DevKit types
- Configuration files extend DevKit presets via imports/extends

## Validation

This fixture validates:
- TypeScript compilation with strict settings
- ESLint rules and formatting
- Test execution with Vitest
- Build process with tsup
- Type declaration generation

See [ADR 0004: Fixtures for DevKit Validation](../../docs/adr/0004-fixtures-validation.md) for more details.
