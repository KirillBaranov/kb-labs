# KB Labs

> **Ecosystem of AI-powered developer tools** focused on Engineering Productivity, AI in SDLC, and Developer Experience.  
> **Central hub for the KB Labs ecosystem** — unified meta-workspace managing 17+ repositories with 20+ products.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs is building a comprehensive AI-powered development ecosystem that transforms how developers work with code, documentation, and testing. Our vision is to create a self-sustaining engineering ecosystem where AI agents handle routine tasks, allowing developers to focus on creative problem-solving and architectural decisions.

### Problem Statement

Modern software development faces several critical challenges:

1. **Repetitive Tasks**: Developers spend significant time on repetitive code review, documentation updates, and test maintenance
2. **Inconsistent Standards**: Different projects use different tools and configurations, making it hard to maintain consistency
3. **Knowledge Silos**: Project knowledge (rules, ADRs, boundaries) is scattered across files and repositories
4. **Limited Automation**: Most development workflows require manual intervention at multiple stages
5. **Tool Fragmentation**: Multiple disconnected tools create context switching overhead

### Our Solution

KB Labs provides a unified ecosystem that addresses these challenges:

- **AI-Powered Automation**: Intelligent agents for code review, documentation, testing, and project management
- **Unified Platform**: Single core platform with consistent APIs, configuration, and tooling across all products
- **Profile-Based Knowledge**: Project knowledge is captured in reusable profiles (rules, ADRs, boundaries) shared across products
- **Self-Sustaining Architecture**: Tools that maintain themselves through automation and AI assistance
- **Developer Experience First**: All tools designed with developer productivity and ease of use as primary goals

### Ecosystem Principles

- **Automation as Survival Constraint**: Automation is not optional—it's essential for sustainability
- **Layered Architecture**: Clear separation between core platform, AI products, and infrastructure
- **Profile-Driven**: Knowledge captured in profiles drives all AI products
- **Self-Documenting**: Comprehensive ADRs (193+), documentation, and transparent decision-making
- **Open Source First**: All tools built with open-source principles and community in mind

### Future Vision: Agent-Based Pluggable System

KB Labs is evolving toward an **agent-based pluggable system** where the entire ecosystem becomes a composable platform for building AI-powered development workflows.

**Pluggable Architecture:**
- **Open Plugin System**: Anyone can write custom plugins for their specific needs
- **Plugin Composition**: Chain together plugins from KB Labs core plugins or community-contributed plugins
- **Plugin Marketplace**: Discover and share plugins with the community
- **Cross-Plugin Communication**: Plugins can communicate and build upon each other's functionality

**Security & Safety:**
- **Sandbox Execution**: All plugins execute in isolated sandbox environments by default
- **Permission System**: Fine-grained permissions control what each plugin can access
- **Resource Limits**: Automatic resource constraints prevent abuse
- **Audit Trail**: Complete audit logging for all plugin executions

**Agent Workflows:**
- **Composable Agents**: Build complex workflows by chaining simple agent plugins
- **Custom Workflows**: Create personalized development workflows by combining existing plugins
- **Community Contributions**: Share and reuse agent workflows from the community
- **Enterprise Ready**: Support for private plugin registries and custom workflows

This future architecture will transform KB Labs into a true platform where developers can build their own AI-powered tools on top of a secure, composable foundation.

## 🏛️ Ecosystem Architecture

KB Labs ecosystem follows a layered architecture model with clear boundaries and dependencies:

```
┌─────────────────────────────────────────────────────────────┐
│                    Applications Layer                        │
│  Studio (Web UI)  |  REST API  |  CLI  |  Third-party Apps  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    AI Products Layer                          │
│  AI Review  |  AI Docs  |  AI Tests  |  Mind  |  Analytics  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Core Platform Layer                        │
│     Core     |    CLI     |   Shared   |  DevKit  |  Schemas │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              Infrastructure & Tools Layer                     │
│  DevLink  |  Release Manager  |  Audit  |  TOX  |  UI         │
└─────────────────────────────────────────────────────────────┘
```

### Core Platform

The foundation of the KB Labs ecosystem:

- **@kb-labs/core** — Runtime core with profiles resolver/validator and infrastructure abstractions
  - 6-layer configuration system
  - Profile resolution with cycle detection
  - Bundle orchestration
  - System interfaces (logging, filesystem, repository)
  - Policy engine for fine-grained permissions

- **@kb-labs/cli** — UX wrapper over core providing unified CLI commands (`kb *`)
  - Single entry point for all KB Labs tools
  - Command registration system
  - Consistent interface across all products
  - JSON output support for automation

- **@kb-labs/shared** — Common types and utilities without side effects
  - Diff parsing utilities
  - Text operations
  - Boundary checking
  - Pure functions only (no side effects)

- **@kb-labs/devkit** — Bootstrap and standards (CI templates, configs, sync)
  - Preset configurations (TypeScript, ESLint, Prettier, Vitest, Tsup)
  - Automatic sync system for keeping projects up-to-date
  - Reusable GitHub Actions workflows
  - Zero-maintenance tooling

- **@kb-labs/profile-schemas** — JSON Schema definitions for profiles, rules, and products
  - Standardized profile validation
  - Reusable profile presets
  - Product schema definitions
  - CI integration for validation

### AI Products

AI-powered tools that leverage the core platform:

**Active Products (MVP 1.0):**

- **@kb-labs/ai-review** — AI-driven code review with rule enforcement and CI/CD integration
  - Profile-based rule sets
  - Dual output (JSON + Markdown)
  - Multiple LLM provider support
  - Analytics integration

- **@kb-labs/analytics** — Analytics and tracking system
  - Event pipeline
  - Storage backends (SQLite, S3)
  - Metrics aggregation
  - Privacy-first design

- **@kb-labs/mind** — AI-powered code analysis and context layer
  - Knowledge graph building
  - Query system for code understanding
  - TOX compression for token efficiency
  - Integration with AI Review

**Planned Products:**

- **@kb-labs/ai-docs** — Automated documentation generation *(Q1 2026)*
- **@kb-labs/ai-tests** — AI-assisted test generation and maintenance *(Q1 2026)*
- **@kb-labs/ai-project-assistant** — Project management and workflow automation *(Q4 2026)*
- **@kb-labs/ai-content** — Content generation and management system *(Q1 2027)*

### Tools & Infrastructure

Supporting tools and infrastructure for the ecosystem:

- **@kb-labs/audit** — Unified quality checks and compliance
- **@kb-labs/rest-api** — HTTP API layer for web applications
- **@kb-labs/studio** — Web-based development environment and dashboard
- **@kb-labs/ui** — Shared UI component library
- **@kb-labs/devlink** — Development linking tool for multi-repo workflows
- **@kb-labs/release-manager** — Release orchestration and automation
- **@kb-labs/tox** — TOX (Terse Object eXchange) format for LLM token efficiency
- **@kb-labs/api-contracts** — Shared API contracts with Zod validation

### Templates

- **@kb-labs/product-template** — Project scaffolding for 5-minute deployment with shared setup and architecture

## 🚀 Quick Start

### Prerequisites

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

### Installation

```bash
# Clone the meta-workspace repository
git clone https://github.com/kirill-baranov/kb-labs.git
cd kb-labs

# Install all dependencies across workspace
pnpm -w install

# Build all packages in workspace
pnpm -r run build
```

### Development

```bash
# Run development mode (parallel across all packages)
pnpm dev

# Build all packages
pnpm build

# Run tests across all packages
pnpm -r run test

# Lint all packages
pnpm -r run lint

# Type check all packages
pnpm type-check

# Full CI pipeline
pnpm check
```

### Meta-Workspace Structure

KB Labs uses a **PNPM meta-workspace** to manage multiple repositories. Each repository is managed independently but shares:

- Common tooling configurations (via DevKit)
- Consistent repository structure
- Unified documentation standards
- Shared development workflows

**Workspace Layout:**

```
kb-labs/                          # Meta-workspace root
├── kb-labs-core/                 # Core platform repository
├── kb-labs-cli/                  # CLI repository
├── kb-labs-shared/               # Shared utilities repository
├── kb-labs-devkit/               # DevKit repository
├── kb-labs-ai-review/            # AI Review repository
├── kb-labs-analytics/            # Analytics repository
├── kb-labs-mind/                 # Mind repository
├── kb-labs-audit/                # Audit repository
├── kb-labs-rest-api/             # REST API repository
├── kb-labs-studio/               # Studio repository
├── kb-labs-ui/                   # UI repository
├── kb-labs-devlink/              # DevLink repository
├── kb-labs-release-manager/     # Release Manager repository
├── kb-labs-tox/                  # TOX repository
├── kb-labs-profile-schemas/      # Profile Schemas repository
├── kb-labs-api-contracts/        # API Contracts repository
├── kb-labs-product-template/     # Product Template repository
└── kb-labs/                      # Main ecosystem repository (this one)
    ├── apps/                     # Demo applications
    ├── packages/                 # Example packages
    ├── docs/                     # Central documentation hub
    │   ├── adr/                  # Architecture Decision Records (193+)
    │   ├── products/             # Product documentation
    │   ├── ecosystem/            # Ecosystem status and health
    │   ├── roadmap/              # Strategic roadmap
    │   └── templates/            # Documentation templates
    └── scripts/                   # Utility scripts
```

> **Note**: See [ADR-0012: PNPM Meta-Workspace Setup](./docs/adr/0012-meta-workspace.md) for detailed information about the meta-workspace architecture.

## 📦 Product Overview

### Core Platform Products

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/core](../products/core.md) | MVP 1.0 | [kb-labs-core](https://github.com/KirillBaranov/kb-labs-core) | Runtime core with profiles resolver/validator and infrastructure abstractions |
| [@kb-labs/cli](../products/cli.md) | MVP 1.0 | [kb-labs-cli](https://github.com/KirillBaranov/kb-labs-cli) | Unified CLI commands (kb *) |
| [@kb-labs/shared](../products/shared.md) | MVP 1.0 | [kb-labs-shared](https://github.com/KirillBaranov/kb-labs-shared) | Common types and utilities without side effects |
| [@kb-labs/devkit](../products/devkit.md) | MVP 1.0 | [kb-labs-devkit](https://github.com/KirillBaranov/kb-labs-devkit) | Bootstrap and standards (CI templates, configs, sync) |
| [@kb-labs/profile-schemas](../products/profile-schemas.md) | MVP 1.0 | [kb-labs-profile-schemas](https://github.com/KirillBaranov/kb-labs-profile-schemas) | JSON Schema definitions for profiles, rules, and products |

### AI Products

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/ai-review](../products/ai-review.md) | MVP 1.0 | [kb-labs-ai-review](https://github.com/KirillBaranov/kb-labs-ai-review) | AI-driven code review with rule enforcement and CI/CD integration |
| [@kb-labs/analytics](../products/analytics.md) | MVP 1.0 | [kb-labs-analytics](https://github.com/KirillBaranov/kb-labs-analytics) | Analytics and tracking system with event pipeline |
| [@kb-labs/mind](../products/mind.md) | MVP 1.0 | [kb-labs-mind](https://github.com/KirillBaranov/kb-labs-mind) | AI-powered code analysis and context layer |
| [@kb-labs/ai-docs](../products/ai-docs.md) | Planning | - | Automated documentation generation *(Q1 2026)* |
| [@kb-labs/ai-tests](../products/ai-tests.md) | Planning | - | AI-assisted test generation and maintenance *(Q1 2026)* |
| [@kb-labs/ai-project-assistant](../products/ai-project-assistant.md) | Planning | - | Project management and workflow automation *(Q4 2026)* |
| [@kb-labs/ai-content](../products/ai-content.md) | Planning | - | Content generation and management system *(Q1 2027)* |

### Tools & Infrastructure

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/audit](../products/audit.md) | MVP 1.0 | [kb-labs-audit](https://github.com/KirillBaranov/kb-labs-audit) | Unified quality checks and compliance |
| [@kb-labs/rest-api](../products/rest-api.md) | MVP 1.0 | [kb-labs-rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) | HTTP API layer for web applications |
| [@kb-labs/studio](../products/studio.md) | MVP 1.0 | [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) | Web-based development environment and dashboard |
| [@kb-labs/ui](../products/ui.md) | MVP 1.0 | [kb-labs-ui](https://github.com/KirillBaranov/kb-labs-ui) | Shared UI component library |
| [@kb-labs/devlink](../products/devlink.md) | MVP 1.0 | [kb-labs-devlink](https://github.com/KirillBaranov/kb-labs-devlink) | Development linking tool for multi-repo workflows |
| [@kb-labs/release-manager](../products/release-manager.md) | MVP 1.0 | [kb-labs-release-manager](https://github.com/KirillBaranov/kb-labs-release-manager) | Release orchestration and automation |
| [@kb-labs/tox](../products/tox.md) | MVP 1.0 | [kb-labs-tox](https://github.com/KirillBaranov/kb-labs-tox) | TOX format for LLM token efficiency |
| [@kb-labs/api-contracts](../products/api-contracts.md) | MVP 1.0 | [kb-labs-api-contracts](https://github.com/KirillBaranov/kb-labs-api-contracts) | Shared API contracts with Zod validation |

### Templates

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/product-template](../products/product-template.md) | MVP 1.0 | [kb-labs-product-template](https://github.com/KirillBaranov/kb-labs-product-template) | Project scaffolding template |

📋 **[View Complete Products Overview](./docs/products/README.md)** — Detailed information about each product

## 🔑 Key Concepts

### Profiles

**Profiles** are project knowledge containers that capture rules, ADRs, documentation, and boundaries. They are reusable across all AI products, enabling consistent behavior and knowledge sharing.

- **Structure**: JSON Schema validated profiles with manifest format
- **Artifacts**: Rules, handbooks, ADRs, boundaries stored as profile artifacts
- **Resolution**: Hierarchical resolution with cycle detection and security constraints
- **Defaults**: Profile-level configuration defaults merged with workspace config

### Diff Parsers

**Diff Parsers** provide a neutral unified-diff AST used across review, tests, and documentation products. They enable consistent diff analysis regardless of the source.

- **Format**: Standard unified-diff format parsing
- **AST**: Abstract syntax tree for structured diff analysis
- **Utilities**: Helper functions for changed files, hunks, and line ranges
- **Integration**: Used by AI Review, AI Tests (planned), and AI Docs (planned)

### Contracts

**Contracts** provide stable interfaces for providers, plugins, and telemetry. They ensure consistency and enable extensibility across the ecosystem.

- **Type Safety**: Zod schemas with TypeScript types
- **Versioning**: Versioned APIs with standardized envelope formats
- **Validation**: Runtime validation with clear error messages
- **Integration**: Shared contracts via `@kb-labs/api-contracts`

### Plugin System

**Plugin System** enables extensible architecture with isolated, composable, and discoverable plugins. Products can be extended without modifying core code.

**Current Capabilities:**
- **Isolation**: Plugins run in isolated contexts
- **Composability**: Plugins can be combined and chained
- **Discovery**: Automatic plugin discovery and registration
- **Extensibility**: Products expose plugin interfaces for customization

**Future Evolution (2026-2027):**
- **Open Plugin Marketplace**: Public registry for sharing and discovering plugins
- **Community Contributions**: Anyone can create and publish plugins for specific use cases
- **Plugin Composition**: Chain together plugins from KB Labs or community contributors
- **Cross-Plugin Communication**: Plugins communicate and build upon each other's functionality
- **Agent-Based Workflows**: Build complex workflows by composing simple agent plugins
- **Sandbox Execution**: All plugins execute in isolated sandbox environments by default for security
- **Permission System**: Fine-grained permissions control what each plugin can access
- **Resource Limits**: Automatic resource constraints prevent abuse
- **Audit Trail**: Complete audit logging for all plugin executions

The plugin system will evolve into a true platform where developers can build their own AI-powered tools by composing existing plugins or creating new ones.

### AI Agents

**AI Agents** are automated workflows for testing, documentation, and release management. They leverage AI to handle routine tasks and make intelligent decisions.

- **Automation**: Routine task automation with AI assistance
- **Decision Making**: Intelligent decision-making based on context and rules
- **Integration**: Deep integration with core platform and profiles
- **Observability**: Comprehensive logging and analytics for agent actions

## 🏗️ Repository Structure

This repository serves as the **central hub** for the KB Labs ecosystem. It contains:

- **Documentation Hub**: Comprehensive documentation, ADRs, roadmaps, and guides
- **Ecosystem Status**: Centralized status tracking for all products
- **Templates**: Documentation and contribution templates
- **Meta-Workspace Configuration**: PNPM workspace configuration for managing all repositories

### Directory Structure

```
kb-labs/
├── apps/                         # Demo applications
│   └── demo/                     # Example demo application
├── packages/                     # Example packages
│   └── package-name/             # Example package template
├── docs/                         # Central documentation hub
│   ├── adr/                      # Architecture Decision Records (193+)
│   │   ├── 0001-architecture-and-reposity-layout.md
│   │   ├── 0002-plugins-and-extensibility.md
│   │   └── ...                   # 193+ ADRs total
│   ├── products/                 # Product documentation
│   │   ├── README.md             # Products overview
│   │   ├── core.md               # Core product details
│   │   ├── cli.md                # CLI product details
│   │   └── ...                   # All products documented
│   ├── ecosystem/                # Ecosystem status and health
│   │   ├── STATUS.md             # Ecosystem status overview
│   │   ├── HEALTH.md             # Health metrics
│   │   └── DEPENDENCIES.md       # Dependency mapping
│   ├── roadmap/                  # Strategic roadmap
│   │   ├── README.md             # Roadmap overview
│   │   ├── 2025/                 # 2025 roadmap
│   │   ├── 2026/                 # 2026 roadmap
│   │   └── 2027/                 # 2027 roadmap
│   ├── templates/                # Documentation templates
│   │   ├── ADR.template.md       # ADR template
│   │   ├── README.template.md    # README template
│   │   ├── CONTRIBUTING.template.md  # Contributing template
│   │   └── DOCUMENTATION.template.md  # Documentation template
│   ├── README.md                 # Documentation index
│   ├── DOCUMENTATION.md          # Documentation standard
│   ├── BUDGET.md                 # Budget and ROI tracking
│   └── glossary.md               # Key terms and concepts
└── scripts/                      # Utility scripts
    └── adr_audit.py              # ADR audit script
```

## 📅 Strategic Roadmap (2025-2027)

### 2025 - Foundation & Migration ✅

**Status**: 🟢 On Track - Exceeding Expectations

**Key Achievements:**
- ✅ **17 packages created** (target: ~5) — 340% of plan
- ✅ **193+ ADRs documented** (target: 20+) — 965% of plan
- ✅ **Complete DevKit migration** across all platform components
- ✅ **MVP 1.0 achieved** for all products (alpha quality)

**Completed:**
- ✅ DevKit Migration — Complete platform migration to DevKit architecture
- ✅ Core Platform Stabilization — Core, CLI, Shared, DevKit all stable
- ✅ Profile System — v1.0 manifest format implemented
- ✅ First AI Products — AI Review, Analytics, Mind all operational

**In Progress:**
- 🚧 ai-review — Migrating to new architecture and deploying first agents
- 🚧 Analytics MVP — Basic events and storage system operational

### 2026 - Product Expansion 🔜

**Focus**: Multiple AI products, plugin system, analytics, public presence

**Planned:**
- 🔜 **ai-docs & ai-tests** — Launch documentation and testing products (Q1 2026)
- 🔜 **Plugin System MVP** — Extensible architecture with profile plugins (Q2 2026)
- 🔜 **Plugin Marketplace** — Public registry for plugin discovery and sharing (Q3 2026)
- 🔜 **Advanced Analytics** — Dashboard and S3 integration (Q3 2026)
- 🔜 **Agent-Based Workflows** — Composable agent plugins with sandbox execution (Q4 2026)
- 🔜 **Public Presence** — Brand building and community engagement (Q4 2026)

### 2027 - Public Expansion 🔜

**Focus**: Brand building, ecosystem maturity, advanced features

**Planned:**
- 🔜 **ai-content** — Content generation and management (Q1 2027)
- 🔜 **Security & Permissions** — Advanced permission system and enhanced sandbox security (Q1 2027)
- 🔜 **Plugin Ecosystem Maturity** — Full agent-based pluggable platform with community plugins (Q2 2027)
- 🔜 **Public Showcase** — Brand building and speaking engagements (Q1-Q2 2027)
- 🔜 **KB Labs 2.0** — Major architectural evolution with fully realized pluggable agent system (Q2+ 2027)

📋 **[View Detailed Roadmap](./docs/roadmap/README.md)** — Complete roadmap with quarterly breakdowns

## 💰 Budget & ROI Tracking

We maintain transparency in our AI tool investments and measure their impact on development productivity.

### Current Status

- **Budget**: $40-80/month (Cursor Pro + ChatGPT Plus)
- **ROI**: ~25:1 (saving 20-30 hours/month)
- **Key Tools**: 
  - Cursor Pro ($20/month) — Primary IDE with AI assistance
  - ChatGPT Plus ($20/month) — Strategic planning and complex reasoning
  - Planned: Cursor Enterprise, additional AI tools as needed

### ROI Calculation

- **Time Saved**: 20-30 hours/month through AI assistance
- **Developer Hourly Rate**: Estimated $50-100/hour (varies by market)
- **Monthly Value**: $1,000-3,000 in saved development time
- **Monthly Cost**: $40-80
- **ROI Ratio**: 12.5:1 to 75:1 (average ~25:1)

### Investment Strategy

We continuously evaluate and optimize our AI tool investments:

- **Productivity Focus**: Tools that directly impact development velocity
- **Strategic Planning**: AI assistance for architectural decisions
- **Automation**: Tools that enable self-sustaining ecosystem
- **Measurable Impact**: ROI tracking ensures value delivery

📊 **[View Budget Details](./docs/BUDGET.md)** — Complete budget breakdown and ROI analysis

## 📚 Documentation

KB Labs maintains comprehensive documentation across all repositories:

### Central Documentation

- **[Documentation Index](./docs/README.md)** — Complete documentation navigation
- **[Documentation Standard](./docs/DOCUMENTATION.md)** — Full documentation guidelines
- **[Contributing Guide](./CONTRIBUTING.md)** — How to contribute
- **[Products Overview](./docs/products/README.md)** — All KB Labs products with status and links
- **[Ecosystem Status](./docs/ecosystem/STATUS.md)** — Status of all products
- **[Glossary](./docs/glossary.md)** — Key terms and concepts
- **[Strategic Roadmap](./docs/roadmap/README.md)** — Long-term roadmap (2025-2027)
- **[Budget & ROI Tracking](./docs/BUDGET.md)** — AI tool investments and ROI metrics

### Architecture Decisions

All architectural decisions are documented in [docs/adr/](./docs/adr/) with 193+ ADRs covering:

- **Architecture**: Repository layout, layering, stability policies
- **Tooling**: Build conventions, DevKit integration, CI/CD
- **Development**: Linking policies, automation strategies
- **Products**: AI products, plugins, profiles, contracts
- **Strategy**: Budget, ROI, ecosystem sustainability

**Key ADRs:**

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
- [ADR-0011: CLI and Directory Naming](./docs/adr/0011-cli-and-directory-naming.md)
- [ADR-0012: PNPM Meta-Workspace Setup](./docs/adr/0012-meta-workspace.md)
- [ADR-0013: Automation as a Survival Constraint](./docs/adr/0013-automation-surival-constraint.md)
- [ADR-0014: Core Profiles and CLI Integration](./docs/adr/0014-core-profiles-cli-integration.md)
- [ADR-0015: KB Labs DevLink Integration](./docs/adr/0015-devlink-integration.md)
- [ADR-0016: Layered Ecosystem Model](./docs/adr/0016-layered-ecosystem-model.md)

📋 **[View All ADRs](./docs/adr/)** — Complete list of 193+ architecture decision records

## 🔗 Ecosystem Dependencies

### Dependency Graph

```
Core Platform Layer:
  @kb-labs/core
    └── @kb-labs/shared
    └── @kb-labs/devkit
  @kb-labs/cli
    └── @kb-labs/core
    └── @kb-labs/shared
  @kb-labs/profile-schemas
    └── @kb-labs/core

AI Products Layer:
  @kb-labs/ai-review
    └── @kb-labs/core
    └── @kb-labs/shared
    └── @kb-labs/cli
  @kb-labs/analytics
    └── @kb-labs/core
    └── @kb-labs/shared
  @kb-labs/mind
    └── @kb-labs/core
    └── @kb-labs/shared
    └── @kb-labs/tox

Infrastructure Layer:
  @kb-labs/rest-api
    └── @kb-labs/api-contracts
    └── @kb-labs/core
  @kb-labs/studio
    └── @kb-labs/ui
    └── @kb-labs/api-contracts
    └── @kb-labs/rest-api
  @kb-labs/devlink
    └── @kb-labs/core
  @kb-labs/release-manager
    └── @kb-labs/core
    └── @kb-labs/shared
```

📊 **[View Dependency Details](./docs/ecosystem/DEPENDENCIES.md)** — Complete dependency mapping

## 📊 Ecosystem Health

### Status Overview

| Category | Total | MVP 1.0 | Planning | In Progress |
|----------|-------|---------|----------|-------------|
| Core Platform | 5 | 5 | 0 | 0 |
| AI Products | 7 | 3 | 4 | 0 |
| Tools & Infrastructure | 8 | 8 | 0 | 0 |
| Templates | 1 | 1 | 0 | 0 |
| **Total** | **21** | **17** | **4** | **0** |

### Health Metrics

- **Documentation Coverage**: 100% (all products have README, CONTRIBUTING, docs/DOCUMENTATION.md)
- **ADR Coverage**: 193+ ADRs across all projects
- **Standard Compliance**: All projects follow KB Labs Documentation Standard
- **Build Status**: All packages build successfully
- **Test Coverage**: Comprehensive test coverage across all packages

📈 **[View Ecosystem Health](./docs/ecosystem/HEALTH.md)** — Detailed health metrics and status

## 🤝 Contributing

KB Labs welcomes contributions! We maintain high standards for code quality, documentation, and architecture decisions.

### Getting Started

1. **Read the Documentation**: Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and [Documentation Standard](./docs/DOCUMENTATION.md)
2. **Review ADRs**: Check relevant ADRs before making architectural changes
3. **Follow Standards**: Use DevKit presets, follow naming conventions, maintain documentation
4. **Submit Changes**: Create PRs with clear descriptions and documentation updates

### Contribution Areas

- **Code**: Bug fixes, new features, performance improvements
- **Documentation**: ADRs, guides, examples, API documentation
- **Architecture**: Propose new ADRs, review existing decisions
- **Testing**: Test coverage, integration tests, fixtures
- **Tooling**: DevKit improvements, CI/CD enhancements

📖 **[Read Contributing Guide](./CONTRIBUTING.md)** — Complete contribution guidelines

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

All KB Labs products are released under the MIT License, ensuring maximum compatibility and adoption potential.

---

**KB Labs** — *Building the future of AI-powered development*

*Last updated: January 2026*
