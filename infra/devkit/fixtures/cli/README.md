# Fixture: CLI Application

This is a minimal CLI application fixture that consumes `@kb-labs/devkit` presets. It demonstrates how to use DevKit in a command-line application context.

## Purpose

This fixture validates that DevKit presets work correctly for CLI applications, including:
- TypeScript compilation with CLI-specific settings
- ESLint rules for CLI code patterns
- Test execution for CLI functionality
- Build process with proper shebang handling

## Configuration

This fixture uses the following DevKit presets:

- **TypeScript**: `@kb-labs/devkit/tsconfig/cli.json` - CLI-specific TypeScript configuration
- **ESLint**: `@kb-labs/devkit/eslint/node.js` - ESLint 9 flat config with TypeScript support
- **Prettier**: `@kb-labs/devkit/prettier/index.json` - Shared formatting configuration
- **Vitest**: `@kb-labs/devkit/vitest/node.js` - Test configuration with Node environment
- **Tsup**: `@kb-labs/devkit/tsup/node.js` - ESM-only build configuration

## Features

- Simple CLI with Commander.js
- Greet command with options
- Calculator with basic operations
- Error handling and exit codes
- Proper shebang for executable

## Usage

This fixture is automatically validated by DevKit's CI pipeline. To run validation locally:

```bash
# From DevKit root
pnpm fixtures:cli:bootstrap  # Install dependencies
pnpm fixtures:cli:check      # Run all validation checks
```

## Structure

- `src/cli.ts` - CLI application entry point with shebang
- `tests/cli.spec.ts` - Tests for CLI functionality
- `types/devkit.d.ts` - TypeScript declarations for DevKit types
- Configuration files extend DevKit presets via imports/extends
