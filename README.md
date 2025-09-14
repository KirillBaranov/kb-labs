# KB Labs

Ecosystem of AI-powered developer tools focused on Engineering Productivity, AI in SDLC, and Developer Experience.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Run development mode
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## 📦 Architecture

### Core Packages
- **@kb-labs/core** — Infrastructure kernel with abstractions (CLI-kit, config runtime, plugin API, telemetry)
- **@kb-labs/shared** — Shared knowledge layer (models, loaders, operations, retrieval, context-assembly)
- **@kb-labs/cli** — Unified CLI to run/manage all KB Labs tools

### Products
- **@kb-labs/ai-review** — AI-driven code review with rule enforcement and CI/CD integration
- **@kb-labs/ai-docs** — Automated documentation generation from code, ADRs, and profiles *(planned)*
- **@kb-labs/ai-tests** — AI-assisted test generation and maintenance *(planned)*

### Templates
- **@kb-labs/product-template** — Starter template for new products with shared setup and architecture

## 🔑 Key Concepts

- **Profiles** — Project knowledge containers (rules, ADRs, docs, boundaries) reused across products
- **Diff Parsers** — Neutral unified-diff AST used in review/tests/docs
- **Contracts** — Stable interfaces for providers, plugins, and telemetry
- **Plugin System** — Extensible architecture with isolated, composable, and discoverable plugins

## 🏗️ Development

### Requirements
- Node.js ≥ 18.18.0
- pnpm ≥ 9.0.0

### Repository Structure
- `/apps` — Example/demo applications and product UIs
- `/packages` — Core logic, reusable libraries, and domain modules
- `/docs` — ADRs, handbook, and guides
- `/fixtures` — Sample diffs, test inputs, and reference data *(optional)*

### Architecture Decisions
All architectural decisions are documented in [docs/adr/](./docs/adr/):
- [ADR-0001: Architecture and Repository Layout](./docs/adr/0001-architecture-and-reposity-layout.md)
- [ADR-0002: Plugins and Extensibility](./docs/adr/0002-plugins-and-extensibility.md)
- [ADR-0003: Package and Module Boundaries](./docs/adr/0003-package-and-module-boundaries.md)
- [ADR-0004: Versioning and Release Policy](./docs/adr/0004-versioning-and-release-policy.md)
- [ADR-0005: Layering & Stability Policy](./docs/adr/0005-layering-stability-police.md)
- [ADR-0006: Local Development Linking Policy](./docs/adr/0006-local-development-linking-policy.md)

## 📅 Roadmap

- ✅ **ai-review MVP** — Core AI review functionality
- 🚧 **ai-docs** — Documentation generation from code and ADRs
- 🚧 **ai-tests** — Test generation and maintenance
- 🔜 **Analytics** — Metrics and insights module

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.
