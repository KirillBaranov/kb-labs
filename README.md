# KB Labs

> **Ecosystem of AI-powered developer tools** focused on Engineering Productivity, AI in SDLC, and Developer Experience.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs is building a comprehensive AI-powered development ecosystem that transforms how developers work with code, documentation, and testing. Our tools leverage AI to automate repetitive tasks, enforce best practices, and accelerate development workflows.

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

### Core Platform
- **@kb-labs/core** — Runtime core with profiles resolver/validator and infrastructure abstractions
- **@kb-labs/cli** — UX wrapper over core providing unified CLI commands (kb *)
- **@kb-labs/shared** — Common types and utilities without side effects
- **@kb-labs/devkit** — Bootstrap and standards (CI templates, configs, sync)
- **@kb-labs/profile-schemas** — JSON Schema definitions for profiles, rules, and products

### AI Products
- **@kb-labs/ai-review** — AI-driven code review with rule enforcement and CI/CD integration (migrating to core/cli)
- **@kb-labs/ai-docs** — Automated documentation generation from code, ADRs, and profiles *(Q1 2026)*
- **@kb-labs/ai-tests** — AI-assisted test generation and maintenance *(Q1 2026)*
- **@kb-labs/ai-project-assistant** — Project management and workflow automation *(Q4 2026)*
- **@kb-labs/ai-content** — Content generation and management system *(Q1 2027)*

### Templates & Tools
- **@kb-labs/product-template** — Project scaffolding for 5-minute deployment with shared setup and architecture

## 🔑 Key Concepts

- **Profiles** — Project knowledge containers (rules, ADRs, docs, boundaries) reused across products
- **Diff Parsers** — Neutral unified-diff AST used in review/tests/docs
- **Contracts** — Stable interfaces for providers, plugins, and telemetry
- **Plugin System** — Extensible architecture with isolated, composable, and discoverable plugins
- **AI Agents** — Automated workflows for testing, documentation, and release management

## 🏗️ Development

### Requirements
- Node.js ≥ 18.18.0
- pnpm ≥ 9.0.0

### Repository Structure
- `/apps` — Example/demo applications and product UIs
- `/packages` — Core logic, reusable libraries, and domain modules
- `/docs` — ADRs, handbook, guides, and roadmap
- `/fixtures` — Sample diffs, test inputs, and reference data *(optional)*

### Architecture Decisions
All architectural decisions are documented in [docs/adr/](./docs/adr/):
- [ADR-0001: Architecture and Repository Layout](./docs/adr/0001-architecture-and-reposity-layout.md)
- [ADR-0002: Plugins and Extensibility](./docs/adr/0002-plugins-and-extensibility.md)
- [ADR-0003: Package and Module Boundaries](./docs/adr/0003-package-and-module-boundaries.md)
- [ADR-0004: Versioning and Release Policy](./docs/adr/0004-versioning-and-release-policy.md)
- [ADR-0005: Layering & Stability Policy](./docs/adr/0005-layering-stability-police.md)
- [ADR-0006: Local Development Linking Policy](./docs/adr/0006-local-development-linking-policy.md)
- [ADR-0007: AI Budget and ROI Tracking](./docs/adr/0007-ai-budget-roi-calculating.md)
- [ADR-0008: AI Usage Optimization](./docs/adr/0008-ai-usage-optimization.md)
- [ADR-0009: Self-Sustaining Engineering Ecosystem](./docs/adr/0009-self-sustaining-engineering-ecosystem.md)
- [ADR-0010: One Package = One Responsibility](./docs/adr/0010-one-package-one-responsibility.md)

## 📅 Strategic Roadmap (2025-2027)

### 2025 - Foundation & Migration
- ✅ **DevKit Migration** — Complete platform migration to DevKit architecture
- 🚧 **ai-review** — Migrate to new architecture and deploy first agents
- 🔜 **Analytics MVP** — Basic events and storage system

### 2026 - Product Expansion
- 🔜 **ai-docs & ai-tests** — Launch documentation and testing products
- 🔜 **Plugin System** — Extensible architecture with profile plugins
- 🔜 **Advanced Analytics** — Dashboard and S3 integration

### 2027 - Public Expansion
- 🔜 **ai-content** — Content generation and management
- 🔜 **Public Showcase** — Brand building and speaking engagements
- 🔜 **KB Labs 2.0** — Major architectural evolution

📋 **[View Detailed Roadmap](./docs/roadmap/README.md)**

## 💰 Budget & ROI Tracking

We maintain transparency in our AI tool investments and measure their impact on development productivity.

- **Current Budget**: $40-80/month (Cursor Pro + ChatGPT Plus)
- **ROI**: ~25:1 (saving 20-30 hours/month)
- **Key Tools**: Cursor Pro, ChatGPT Plus, with planned upgrades

📊 **[View Budget Details](./docs/BUDGET.md)**

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

*Last updated: September 30, 2025*
