# Fixture: Web Application

This is a minimal web application fixture that consumes `@kb-labs/devkit` presets. It demonstrates how to use DevKit in a web application context with DOM APIs and modern web features.

## Purpose

This fixture validates that DevKit presets work correctly for web applications, including:
- TypeScript compilation with DOM and web APIs
- ESLint rules for web-specific code patterns
- Test execution with web environment mocking
- Build process for browser-compatible output

## Configuration

This fixture uses the following DevKit presets:

- **TypeScript**: `@kb-labs/devkit/tsconfig/lib.json` - Library configuration with DOM support
- **ESLint**: `@kb-labs/devkit/eslint/node.js` - ESLint 9 flat config with TypeScript support
- **Prettier**: `@kb-labs/devkit/prettier/index.json` - Shared formatting configuration
- **Vitest**: `@kb-labs/devkit/vitest/node.js` - Test configuration with Node environment
- **Tsup**: `@kb-labs/devkit/tsup/node.js` - ESM-only build configuration

## Features

- **UserService**: HTTP client for API interactions with proper error handling
- **DOMUtils**: Utility functions for DOM manipulation
- **EventBus**: Simple event system for component communication
- **TypeScript**: Full type safety with DOM and web API types
- **Testing**: Comprehensive test coverage with mocked web APIs

## Usage

This fixture is automatically validated by DevKit's CI pipeline. To run validation locally:

```bash
# From DevKit root
pnpm fixtures:web:bootstrap  # Install dependencies
pnpm fixtures:web:check      # Run all validation checks
```

## Structure

- `src/index.ts` - Web application utilities and services
- `tests/web.spec.ts` - Tests for web functionality with mocked APIs
- `types/devkit.d.ts` - TypeScript declarations for DevKit types
- Configuration files extend DevKit presets via imports/extends

## Web-Specific Features

- DOM manipulation utilities
- Fetch API integration with proper error handling
- Event system for component communication
- TypeScript DOM types and web API support
- Mocked web APIs for testing
