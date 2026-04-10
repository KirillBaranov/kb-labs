# Contributing Guide

Thanks for considering a contribution to **KB Labs** projects!

---

## Development setup

```bash
pnpm i
pnpm dev
```

## 📋 Development Guidelines

### Code Style

- **Coding style**: Follow ESLint + Prettier rules. Run `pnpm lint` before pushing.
- **TypeScript**: Use strict mode and proper type annotations.
- **Testing**: Cover all changes with Vitest. Run `pnpm test`.
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
- Include required metadata (Date, Status, Deciders, **Last Reviewed**, **Tags**)
- **Last Reviewed** date is required and should be updated periodically
- **Tags** are mandatory (minimum 1, maximum 5 tags from approved list)
- See [Documentation Standard](./docs/DOCUMENTATION.md) for ADR format requirements

## DevKit Integration

This project uses `@kb-labs/devkit` for shared tooling configurations. Key points:

- **Configurations**: ESLint, Prettier, Vitest, TypeScript, and GitHub Actions are managed by devkit
- **Local configs**: Act as thin wrappers over devkit configurations
- **Updates**: When devkit is updated, run `pnpm install` to get the latest configurations
- **Customization**: For project-specific rules, extend devkit configs rather than overriding them

### DevKit Commands

- `pnpm devkit:sync` - Sync DevKit configurations (runs automatically on install)
- `pnpm devkit:check` - Check if sync is needed
- `pnpm devkit:force` - Force sync (overwrites existing configs)
- `pnpm devkit:help` - Show help and available options

For more details, see [ADR-0005: Use DevKit for Shared Tooling](docs/adr/0005-use-devkit-for-shared-tooling.md).

---

## 🔄 Pull Request Process

### Before Submitting

1. **Fork** the repository and create a feature branch
2. **Make your changes** following the guidelines above
3. **Test thoroughly**:
   ```bash
   pnpm check  # Runs lint + type-check + tests
   ```
4. **Update documentation** if needed (README, API docs, ADRs)
5. **Submit a PR** with:
   - Clear description of changes
   - Reference any related issues
   - Ensure all CI checks pass

### PR Requirements

- Clear, descriptive title and description
- Reference any related issues
- Ensure all CI checks pass
- Request review from maintainers

---

**See [Documentation Standard](./docs/DOCUMENTATION.md) for complete documentation guidelines.**
