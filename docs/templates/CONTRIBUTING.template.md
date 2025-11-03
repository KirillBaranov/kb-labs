# Contributing to [Project Name]

Thanks for considering a contribution to **[Project Name]**!  
This guide will help you get started with development and ensure your contributions align with our architecture and standards.

---

## 🚀 Development Setup

### Prerequisites

- Node.js ≥ 18.18.0
- pnpm ≥ 9.0.0

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd [project-name]

# Install dependencies
pnpm install

# Start development mode
pnpm dev

# Run tests
pnpm test
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
pnpm test            # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm type-check       # TypeScript type checking
pnpm check            # Run lint + type-check + tests

# Cleanup
pnpm clean            # Clean build artifacts
pnpm clean:all        # Clean all node_modules and build artifacts
```

## 📋 Development Guidelines

### Code Style

- **Coding style**: Follow ESLint + Prettier rules. Run `pnpm lint` before pushing.
- **TypeScript**: Use strict mode and proper type annotations.
- **Testing**: Cover all changes with Vitest tests. Run `pnpm test`.
- **Documentation**: Document all public APIs and complex logic.

### Commit Messages

Use conventional commit format:

```
feat: add new feature
fix: correct bug
docs: update documentation
refactor: restructure code
test: add or update tests
chore: maintenance tasks
```

### Architecture Decisions

- For significant architectural changes, add an ADR in `docs/adr/`
- Follow the ADR template in `docs/adr/0000-template.md`
- Include rationale, alternatives considered, and consequences
- See [Documentation Standard](./docs/DOCUMENTATION.md) for ADR format requirements

### Package Guidelines

[Add project-specific guidelines here, e.g., API stability, performance considerations, etc.]

---

## 🔄 Pull Request Process

### Before Submitting

1. **Fork** the repository and create a feature branch from `main`
2. **Make your changes** following the guidelines above
3. **Test thoroughly**:
   ```bash
   pnpm check  # Runs lint + type-check + tests
   ```
4. **Update documentation** if needed (README, API docs, ADRs)
5. **Submit a PR** with:
   - Clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all CI checks pass

### PR Requirements

- Clear, descriptive title and description
- Reference any related issues
- Include screenshots for UI changes (if applicable)
- Ensure all CI checks pass
- Request review from maintainers

### Review Process

- Maintainers will review your PR
- Address any feedback
- Once approved, your PR will be merged

---

## 🏗️ Architecture Decisions

Before making significant changes, review relevant ADRs:

- [ADR Template](./docs/adr/0000-template.md) - Template for new ADRs
- [Documentation Standard](./docs/DOCUMENTATION.md) - ADR format requirements

### Creating New ADRs

For architectural changes:

1. Create a new ADR file in `docs/adr/` following the template
2. Include context, decision rationale, and consequences
3. Add required metadata (Date, Status, Deciders, Last Reviewed, Tags)
4. Get team review before implementation

---

**See [Documentation Standard](./docs/DOCUMENTATION.md) for complete documentation guidelines.**


