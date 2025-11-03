# Contributing Guide

Thanks for considering a contribution to **KB Labs**! This guide will help you get started with development and ensure your contributions align with our architecture and standards.

## 🚀 Development Setup

### Prerequisites
- Node.js ≥ 18.18.0
- pnpm ≥ 9.0.0

### Initial Setup
```bash
# Clone the repository
git clone <repository-url>
cd kb-labs

# Install dependencies
pnpm install

# Start development mode
pnpm dev
```

### Available Scripts
```bash
# Development
pnpm dev              # Start all packages in development mode
pnpm build            # Build all packages
pnpm build:clean      # Clean and build all packages

# Quality Assurance
pnpm lint             # Run ESLint on all packages
pnpm lint:fix         # Fix ESLint issues automatically
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm type-check       # TypeScript type checking
pnpm check            # Run lint + type-check + tests

# Cleanup
pnpm clean            # Clean build artifacts
pnpm clean:all        # Clean all node_modules and build artifacts
```

## 📋 Development Guidelines

### Code Style
- Follow ESLint + Prettier rules configured in the project
- Run `pnpm lint` before committing
- Use TypeScript for all new code
- Follow the established naming conventions

### Testing
- Write tests for all new functionality using Vitest
- Maintain test coverage for critical paths
- Use descriptive test names and organize tests logically
- Run `pnpm test` to ensure all tests pass

### Commit Messages
Use conventional commit format:
```
feat: add new feature
fix: resolve bug in component
docs: update documentation
refactor: restructure code without changing behavior
test: add or update tests
chore: maintenance tasks
```

### Package Boundaries
Follow the architecture defined in [ADR-0003](./docs/adr/0003-package-and-module-boundaries.md):
- Each package must have clear public API in `index.ts`
- Use workspace aliases (`@kb-labs/<pkg>`) for cross-package imports
- Keep core logic in `@kb-labs/core`, product-specific code in `@kb-labs/<product>`

### Plugin Development
When extending functionality, follow [ADR-0002](./docs/adr/0002-plugins-and-extensibility.md):
- Create isolated, composable plugins
- Use TypeScript types and Zod schemas from `@kb-labs/core`
- Register plugins via central registry or configuration

## 🏗️ Architecture Decisions

Before making significant changes, review relevant ADRs:

- **[ADR-0001: Architecture and Repository Layout](./docs/adr/0001-architecture-and-reposity-layout.md)** — Repository structure and organization
- **[ADR-0002: Plugins and Extensibility](./docs/adr/0002-plugins-and-extensibility.md)** — Plugin system design
- **[ADR-0003: Package and Module Boundaries](./docs/adr/0003-package-and-module-boundaries.md)** — Package dependencies and boundaries
- **[ADR-0004: Versioning and Release Policy](./docs/adr/0004-versioning-and-release-policy.md)** — Versioning strategy
- **[ADR-0005: Layering & Stability Policy](./docs/adr/0005-layering-stability-police.md)** — API stability and layering
- **[ADR-0006: Local Development Linking Policy](./docs/adr/0006-local-development-linking-policy.md)** — Development workflow

### Creating New ADRs

For architectural changes:

1. Create a new ADR file in `docs/adr/` following the template in `docs/adr/0000-template.md`
2. Include required metadata:
   - **Date**: When the decision was made
   - **Status**: Proposed | Accepted | Deprecated | Superseded
   - **Deciders**: Decision makers
   - **Last Reviewed**: Date of last review (required)
   - **Reviewers**: Optional list of reviewers
   - **Tags**: 1-5 tags from approved list (required)
3. Include context, decision rationale, and consequences
4. See [Documentation Standard](./docs/DOCUMENTATION.md) for complete ADR format requirements
5. Get team review before implementation

---

**See [Documentation Standard](./docs/DOCUMENTATION.md) for complete documentation guidelines.**

## 🔄 Pull Request Process

### Before Submitting
1. **Fork** the repository and create a feature branch
2. **Make your changes** following the guidelines above
3. **Run quality checks**: `pnpm check`
4. **Update documentation** if needed
5. **Add tests** for new functionality

### PR Requirements
- Clear, descriptive title and description
- Reference any related issues
- Include screenshots for UI changes
- Ensure all CI checks pass
- Request review from maintainers

### Review Process
- All PRs require at least one review
- Address feedback promptly
- Keep PRs focused and reasonably sized
- Update branch if conflicts arise

## 🐛 Bug Reports

When reporting bugs, include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, etc.)
- Relevant logs or error messages

## 💡 Feature Requests

For new features:
- Check existing issues and ADRs first
- Provide clear use case and motivation
- Consider impact on existing architecture
- Discuss with maintainers before implementation

## 📞 Getting Help

- Check existing [issues](https://github.com/kirill-baranov/kb-labs/issues)
- Review ADRs for architectural guidance
- Ask questions in discussions or issues

---

Thank you for contributing to KB Labs! 🎉