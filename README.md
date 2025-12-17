# KB Labs

> **Ecosystem of AI-powered developer tools** focused on Engineering Productivity, AI in SDLC, and Developer Experience.
> **Central hub for the KB Labs ecosystem** — unified meta-workspace managing 21 repositories with 25+ products.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

**Quick Navigation:**
[🚀 Quick Start](#-quick-start) •
[💡 Platform Philosophy](#platform-first-philosophy-focus-on-business-logic-not-infrastructure) •
[📦 Products](#-product-overview) •
[🗺️ Roadmap](#-strategic-roadmap-2025-2027) •
[📄 License](#-license)

---

> [!WARNING]
> **🚧 Active Development — Not Ready for External Use**
>
> KB Labs is currently in **active development** and is **not distributed to external users or customers**. This is a personal development ecosystem being built and tested internally. The platform is evolving rapidly with breaking changes, incomplete features, and experimental architectures.
>
> **What this means:**
> - ❌ **No installation packages** — Not available via npm, not ready for external installation
> - ❌ **No stability guarantees** — APIs and architecture change frequently without notice
> - ❌ **No support** — This is not a product available for public use
> - ✅ **Open development** — Code is public for transparency and future collaboration
> - ✅ **Learning resource** — Feel free to explore the architecture and ideas
>
> **Timeline:** Public release and distribution are planned for **2026-2027** after core platform stabilization and plugin ecosystem maturity. See [Strategic Roadmap](#-strategic-roadmap-2025-2027) for details.

## 🎯 Vision

KB Labs is building a comprehensive AI-powered development ecosystem that transforms how developers work with code, documentation, and testing. Our vision is to create a self-sustaining engineering ecosystem where AI agents handle routine tasks, allowing developers to focus on creative problem-solving and architectural decisions.

**Current Stage**: MVP 1.0 — All core products operational, agent-based pluggable system in development (2026-2027). We maintain transparent planning and budget tracking to ensure sustainable growth and measurable ROI.

### Problem Statement

Modern software development faces several critical challenges:

1. **Repetitive Tasks**: Developers spend significant time on repetitive code review, documentation updates, and test maintenance
2. **Inconsistent Standards**: Different projects use different tools and configurations, making it hard to maintain consistency
3. **Knowledge Silos**: Project knowledge (rules, ADRs, boundaries) is scattered across files and repositories
4. **Limited Automation**: Most development workflows require manual intervention at multiple stages
5. **Tool Fragmentation**: Multiple disconnected tools create context switching overhead
6. **Infrastructure Overhead**: Building AI-powered tools requires reinventing rate limiting, error handling, multi-tenancy, and observability for each project

### Our Solution

KB Labs provides a unified ecosystem that addresses these challenges:

- **AI-Powered Automation**: Intelligent agents for code review, documentation, testing, and project management
- **Unified Platform**: Single core platform with consistent APIs, configuration, and tooling across all products
- **Profile-Based Knowledge**: Project knowledge is captured in reusable profiles (rules, ADRs, boundaries) shared across products
- **Platform-First Architecture**: Infrastructure concerns (rate limiting, error handling, multi-tenancy, observability) handled by the platform—plugins focus purely on business logic
- **Self-Sustaining Architecture**: Tools that maintain themselves through automation and AI assistance
- **Developer Experience First**: All tools designed with developer productivity and ease of use as primary goals

### Ecosystem Principles

- **Automation as Survival Constraint**: Automation is not optional—it's essential for sustainability
- **Layered Architecture**: Clear separation between core platform, AI products, and infrastructure
- **Profile-Driven**: Knowledge captured in profiles drives all AI products
- **Self-Documenting**: Comprehensive ADRs (193+), documentation, and transparent decision-making
- **Open Development**: Transparent development process and architecture shared publicly for learning and future collaboration
- **Data-Driven Planning**: Strategic roadmap with clear milestones and measurable outcomes
- **Sustainable Budgeting**: Transparent ROI tracking ensures efficient resource allocation

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

### Platform-First Philosophy: Focus on Business Logic, Not Infrastructure

KB Labs is designed as a **platform ecosystem** where plugins gather around unified rules and infrastructure:

**What the Platform Handles (99% of the pain):**
- ✅ **Rate Limiting & Quotas**: Built-in 429 error handling, automatic retries, backoff strategies
- ✅ **Graceful Degradation**: Fallback mechanisms when LLM providers are unavailable
- ✅ **Multi-Tenancy**: Tenant isolation, quotas, and resource management out of the box
- ✅ **Observability**: Logging, metrics, tracing, and error tracking automatically configured
- ✅ **State Management**: Persistent cache, session management, cross-invocation state
- ✅ **Scalability**: From single developer to distributed enterprise deployment
- ✅ **Security**: Sandboxing, permissions, audit trails, secrets management
- ✅ **Integration**: Unified CLI, REST API, webhooks, and Studio UI adapters

**What Plugins Focus On (business value):**
- 💡 **Your Business Logic**: Solve your specific problem, not infrastructure concerns
- 💡 **Domain Expertise**: Code review rules, documentation styles, test strategies
- 💡 **Custom Workflows**: Your team's unique development processes
- 💡 **Integrations**: Connect to your tools and services

**The Value Proposition:**

Instead of spending weeks building:
- Rate limiting for OpenAI/Anthropic APIs
- Retry logic with exponential backoff
- Multi-tenant quota enforcement
- Graceful degradation when LLM providers fail
- Logging, monitoring, and alerting infrastructure

**You write:**
```typescript
import { defineCommand, useLLM, useLogger, useStorage } from '@kb-labs/sdk';

export const analyze = defineCommand({
  name: 'analyze',
  async handler(ctx, argv, flags) {
    const llm = useLLM();           // Composable: LLM with rate limiting
    const logger = useLogger();     // Composable: Structured logging
    const storage = useStorage();   // Composable: Persistent storage

    const result = await llm.complete(prompt);
    await storage.set('last-analysis', result);
    logger.info('Analysis completed', { tokens: result.usage });

    return { analysis: result.content };
  }
});
```

The platform handles everything else. You focus on **what makes your plugin unique**, not reinventing infrastructure.

> **Design Philosophy**: Inspired by **Vue 3's Composition API**
>
> KB Labs SDK uses composable helper functions (`useLLM`, `useLogger`, `useStorage`, etc.) that encapsulate complexity and provide clean, testable abstractions. Like Vue 3 composables, these utilities are:
> - **Composable**: Mix and match functionality as needed
> - **Typed**: Full TypeScript support with inference
> - **Testable**: Easy to mock in unit tests
> - **Declarative**: Clear, readable code that expresses intent

## 🏛️ Ecosystem Architecture

KB Labs ecosystem follows a layered architecture model with clear boundaries and dependencies:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Applications Layer                          │
│   Studio (Web UI)  |  REST API  |  CLI  |  Third-party Apps     │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      AI Products Layer                           │
│  AI Review  |  AI Docs  |  AI Tests  |  Mind  |  Analytics      │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                           │
│         Workflow Engine  |  Plugin System  |  Setup Engine      │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      Core Platform Layer                         │
│       Core    |    CLI    |   Shared   |  DevKit  |  Knowledge  │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                Infrastructure & Tools Layer                      │
│     DevLink   |  Release Manager  |  Audit  |  UI               │
└─────────────────────────────────────────────────────────────────┘
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

- **@kb-labs/knowledge** — Knowledge management contracts and runtime
  - Standardized knowledge artifacts
  - Reusable knowledge presets
  - Integration with AI products

- **@kb-labs/sdk** — Unified plugin development SDK with Vue 3-inspired composables
  - **Composable helpers**: `useLLM`, `useLogger`, `useStorage`, `useAnalytics`, `usePlatform`
  - **Command builders**: `defineCommand`, `defineFlags`, `validateFlags`
  - **Manifest utilities**: `defineManifest`, `defineCommandFlags`, permissions system
  - **REST handlers**: `defineRestHandler` for HTTP endpoints
  - **Lifecycle hooks**: `defineSetupHandler`, `defineDestroyHandler`
  - **Full TypeScript support** with type inference
  - Single import point — no deep imports into internal packages

### AI Products

AI-powered tools that leverage the core platform:

**Active Products (MVP 1.0):**

- **@kb-labs/ai-review** — AI-driven code review with rule enforcement and CI/CD integration
  - Profile-based rule sets
  - Dual output (JSON + Markdown)
  - Multiple LLM provider support
  - Analytics integration

- **@kb-labs/ai-docs** — Engineering-first documentation assistant
  - Bootstrap, plan, generate, and audit technical docs
  - Mind context integration for accurate generation
  - Drift detection between code and docs

- **@kb-labs/ai-tests** — AI-powered test generation and maintenance
  - Plan, generate, run, repair, and audit automated tests
  - Mind context for intelligent test generation
  - Multi-framework support

- **@kb-labs/analytics** — Analytics and tracking system
  - Event pipeline
  - Storage backends (SQLite, S3)
  - Metrics aggregation
  - Privacy-first design

- **@kb-labs/mind** — AI-powered code analysis and context layer
  - Hybrid search (BM25 + vector)
  - RAG system for code understanding
  - Anti-hallucination verification
  - Integration with all AI products

**Planned Products:**

- **@kb-labs/ai-project-assistant** — Project management and workflow automation *(Q4 2026)*
- **@kb-labs/ai-content** — Content generation and management system *(Q1 2027)*

### Orchestration Layer

Systems for workflow execution and plugin management:

- **@kb-labs/workflow** — Workflow orchestration engine
  - Declarative workflow definitions
  - Job scheduling and step execution
  - Distributed coordination through Redis
  - Multi-tenancy support

- **@kb-labs/plugin** — Plugin system infrastructure
  - Manifest V1/V2 format definitions
  - Runtime execution with sandboxing
  - CLI, REST, and Studio adapters
  - Developer tools for plugin development

- **@kb-labs/setup-engine** — Setup workflows engine
  - Declarative operations with rollback support
  - Idempotent execution
  - Plugin and CLI installers

### Tools & Infrastructure

Supporting tools and infrastructure for the ecosystem:

- **@kb-labs/audit** — Unified quality checks and compliance
- **@kb-labs/rest-api** — HTTP API layer for web applications
- **@kb-labs/studio** — Web-based development environment and dashboard
- **@kb-labs/ui** — Shared UI component library
- **@kb-labs/devlink** — Development linking tool for multi-repo workflows
- **@kb-labs/release-manager** — Release orchestration and automation

### Templates

- **@kb-labs/product-template** — Project scaffolding for 5-minute deployment with shared setup and architecture
- **@kb-labs/plugin-template** — Gold standard reference template for production-ready KB Labs plugins

## 🚀 Quick Start

> [!NOTE]
> **For Explorers & Future Contributors Only**
>
> These instructions are for developers who want to explore the codebase architecture, study the implementation, or prepare for future contributions. This is **not** a production installation guide—the platform is in active development and not ready for external deployment.

### Prerequisites

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

### Local Setup (For Exploration)

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

### Example: AI-Powered Commit Generation

One of KB Labs' AI products is the commit plugin that automatically generates conventional commits:

```bash
$ pnpm kb commit commit --scope="@kb-labs/package-name"

OK Git status analyzed
OK Generated commit plan with 1 commit(s)
OK Applied 1 commit(s)

Applied commits:
  [df48073] docs(kb-labs): add license files and readme for kb-labs

┌── Done
│
│ Summary
│  Commits:  1
│  Pushed:   No
│  LLM:      Phase 1
│  Tokens:   1022
│
└── OK Success
```

This showcases the ecosystem's core principle: **AI-powered automation for routine development tasks**.

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
├── kb-labs-knowledge/            # Knowledge contracts repository
├── kb-labs-ai-review/            # AI Review repository
├── kb-labs-ai-docs/              # AI Docs repository
├── kb-labs-ai-tests/             # AI Tests repository
├── kb-labs-analytics/            # Analytics repository
├── kb-labs-mind/                 # Mind repository
├── kb-labs-workflow/             # Workflow engine repository
├── kb-labs-plugin/               # Plugin system repository
├── kb-labs-setup-engine/         # Setup engine repository
├── kb-labs-audit/                # Audit repository
├── kb-labs-rest-api/             # REST API repository
├── kb-labs-studio/               # Studio repository
├── kb-labs-ui/                   # UI repository
├── kb-labs-devlink/              # DevLink repository
├── kb-labs-release-manager/      # Release Manager repository
├── kb-labs-product-template/     # Product Template repository
├── kb-labs-plugin-template/      # Plugin Template repository
└── kb-labs/                      # Main ecosystem repository (this one)
    ├── apps/                     # Demo applications
    ├── packages/                 # Example packages
    ├── docs/                     # Central documentation hub
    │   ├── adr/                  # Architecture Decision Records
    │   ├── products/             # Product documentation
    │   ├── ecosystem/            # Ecosystem status and health
    │   ├── roadmap/              # Strategic roadmap
    │   └── templates/            # Documentation templates
    └── scripts/                  # Utility scripts
```

> **Note**: See [ADR-0012: PNPM Meta-Workspace Setup](./docs/adr/0012-meta-workspace.md) for detailed information about the meta-workspace architecture.

## 📦 Product Overview

### Core Platform Products

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/core](./docs/products/core.md) | MVP 1.0 | [kb-labs-core](https://github.com/KirillBaranov/kb-labs-core) | Runtime core with profiles resolver/validator and infrastructure abstractions |
| [@kb-labs/cli](./docs/products/cli.md) | MVP 1.0 | [kb-labs-cli](https://github.com/KirillBaranov/kb-labs-cli) | Unified CLI commands (kb *) |
| [@kb-labs/shared](./docs/products/shared.md) | MVP 1.0 | [kb-labs-shared](https://github.com/KirillBaranov/kb-labs-shared) | Common types and utilities without side effects |
| [@kb-labs/devkit](./docs/products/devkit.md) | MVP 1.0 | [kb-labs-devkit](https://github.com/KirillBaranov/kb-labs-devkit) | Bootstrap and standards (CI templates, configs, sync) |
| [@kb-labs/knowledge](./docs/products/knowledge.md) | MVP 1.0 | [kb-labs-knowledge](https://github.com/KirillBaranov/kb-labs-knowledge) | Knowledge management contracts and runtime |

### AI Products

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/ai-review](./docs/products/ai-review.md) | MVP 1.0 | [kb-labs-ai-review](https://github.com/KirillBaranov/kb-labs-ai-review) | AI-driven code review with rule enforcement and CI/CD integration |
| [@kb-labs/ai-docs](./docs/products/ai-docs.md) | MVP 1.0 | [kb-labs-ai-docs](https://github.com/KirillBaranov/kb-labs-ai-docs) | Engineering-first documentation assistant |
| [@kb-labs/ai-tests](./docs/products/ai-tests.md) | MVP 1.0 | [kb-labs-ai-tests](https://github.com/KirillBaranov/kb-labs-ai-tests) | AI-powered test generation and maintenance |
| [@kb-labs/analytics](./docs/products/analytics.md) | MVP 1.0 | [kb-labs-analytics](https://github.com/KirillBaranov/kb-labs-analytics) | Analytics and tracking system with event pipeline |
| [@kb-labs/mind](./docs/products/mind.md) | MVP 1.0 | [kb-labs-mind](https://github.com/KirillBaranov/kb-labs-mind) | AI-powered code analysis and RAG context layer |
| [@kb-labs/ai-project-assistant](./docs/products/ai-project-assistant.md) | Planning | - | Project management and workflow automation *(Q4 2026)* |
| [@kb-labs/ai-content](./docs/products/ai-content.md) | Planning | - | Content generation and management system *(Q1 2027)* |

### Orchestration Layer

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/workflow](./docs/products/workflow.md) | MVP 1.0 | [kb-labs-workflow](https://github.com/KirillBaranov/kb-labs-workflow) | Workflow orchestration engine with Redis coordination |
| [@kb-labs/plugin](./docs/products/plugin.md) | MVP 1.0 | [kb-labs-plugin](https://github.com/KirillBaranov/kb-labs-plugin) | Plugin system infrastructure with manifest V1/V2 |
| [@kb-labs/setup-engine](./docs/products/setup-engine.md) | MVP 1.0 | [kb-labs-setup-engine](https://github.com/KirillBaranov/kb-labs-setup-engine) | Setup workflows with idempotent execution |

### Tools & Infrastructure

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/audit](./docs/products/audit.md) | MVP 1.0 | [kb-labs-audit](https://github.com/KirillBaranov/kb-labs-audit) | Unified quality checks and compliance |
| [@kb-labs/rest-api](./docs/products/rest-api.md) | MVP 1.0 | [kb-labs-rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) | HTTP API layer for web applications |
| [@kb-labs/studio](./docs/products/studio.md) | MVP 1.0 | [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) | Web-based development environment and dashboard |
| [@kb-labs/ui](./docs/products/ui.md) | MVP 1.0 | [kb-labs-ui](https://github.com/KirillBaranov/kb-labs-ui) | Shared UI component library |
| [@kb-labs/devlink](./docs/products/devlink.md) | MVP 1.0 | [kb-labs-devlink](https://github.com/KirillBaranov/kb-labs-devlink) | Development linking tool for multi-repo workflows |
| [@kb-labs/release-manager](./docs/products/release-manager.md) | MVP 1.0 | [kb-labs-release-manager](https://github.com/KirillBaranov/kb-labs-release-manager) | Release orchestration and automation |

### Templates

| Product | Status | Repository | Description |
|---------|--------|------------|-------------|
| [@kb-labs/product-template](./docs/products/product-template.md) | MVP 1.0 | [kb-labs-product-template](https://github.com/KirillBaranov/kb-labs-product-template) | Project scaffolding template |
| [@kb-labs/plugin-template](./docs/products/plugin-template.md) | MVP 1.0 | [kb-labs-plugin-template](https://github.com/KirillBaranov/kb-labs-plugin-template) | Gold standard plugin reference template |

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
- **Integration**: Contracts defined within each product package

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
│   │   ├── 0001-architecture-and-repository-layout.md
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

> **Planning Philosophy**: KB Labs follows a data-driven planning approach with clear milestones, measurable outcomes, and transparent budget tracking. All decisions are documented in ADRs and tracked through our roadmap system.

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

## 💡 Development Efficiency & AI-Powered Workflow

> **Philosophy**: KB Labs validates the "automation as survival constraint" principle through metrics. We track how AI-assisted development enables sustainable solo engineering at scale.

### AI-Assisted Development Stack

KB Labs is built using an AI-first development approach:

- **Claude AI (Sonnet 4.5)** — Primary development assistant for architecture, coding, and problem-solving
  - Claude Max subscription: $100/month
- **ChatGPT Plus (GPT-4)** — Strategic planning, complex reasoning, and alternative perspectives
  - Cost: $20/month
- **Infrastructure** — API costs for platform operations (embeddings, LLM calls for automation)
  - Cost: ~$5-10/month

**Total Investment**: ~$125-130/month for AI tooling and infrastructure

### Productivity Metrics

Real-world impact of AI-assisted development on KB Labs ecosystem:

- **Development Velocity**: 30-40 hours/month of effective development time saved
- **Code Quality**: AI-powered reviews catch issues before commit
- **Documentation**: Automated generation maintains 100% coverage across 21 repositories
- **Architecture**: AI assists in exploring tradeoffs and validating decisions (193+ ADRs)

**Efficiency Multiplier**: ~12-30x ROI on AI tool investment (depending on developer rate assumptions)

This demonstrates that **sustainable solo development at scale** is achievable through intelligent automation—the core thesis of KB Labs.

### Why This Matters

KB Labs isn't just building AI tools—it's **built with** AI tools, and now **builds itself** using its own tools:

1. **Dogfooding at scale**: KB Labs is its own first and most active user
   - Commit plugin generates conventional commits for the platform itself
   - Mind RAG searches the platform's own codebase for faster development
   - DevKit tools maintain consistency across all 21 repositories
   - Analytics tracks platform development metrics

2. **Self-improving ecosystem**: The platform has reached a stage where it accelerates its own development
   - Less manual work, more automation with each iteration
   - Tools built with the platform become tools that improve the platform
   - Each new feature makes building the next feature faster

3. **Validation through use**: Every tool is battle-tested on real development workflows
   - If it works for building KB Labs, it will work for building your projects
   - Continuous feedback loop drives quality improvements
   - Real-world usage metrics inform feature priorities

4. **Automation enables sustainability**: One developer maintaining 21+ repositories through AI assistance and self-sustaining automation

**The flywheel effect**: As KB Labs matures, it becomes increasingly efficient at improving itself—demonstrating that self-sustaining engineering ecosystems are not just possible, but practical.

> 💡 **Meta moment**: This entire README—including the documentation you're reading right now—was committed using KB Labs' own commit plugin. Every architectural decision, every code change, every documentation update goes through the same AI-powered workflow that the platform provides to users.
>
> **We eat our own dog food, daily.** If a tool isn't good enough for building KB Labs itself, it's not good enough for release.

📊 **[View Detailed Metrics](./docs/BUDGET.md)** — Complete efficiency analysis and ROI breakdown

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

- [ADR-0001: Architecture and Repository Layout](./docs/adr/0001-architecture-and-repository-layout.md)
- [ADR-0002: Plugins and Extensibility](./docs/adr/0002-plugins-and-extensibility.md)
- [ADR-0003: Package and Module Boundaries](./docs/adr/0003-package-and-module-boundaries.md)
- [ADR-0004: Versioning and Release Policy](./docs/adr/0004-versioning-and-release-policy.md)
- [ADR-0005: Layering & Stability Policy](./docs/adr/0005-layering-stability-policy.md)
- [ADR-0006: Local Development Linking Policy](./docs/adr/0006-local-development-linking-policy.md)
- [ADR-0007: AI Budget and ROI Tracking](./docs/adr/0007-ai-budget-roi-calculating.md)
- [ADR-0008: AI Usage Optimization](./docs/adr/0008-ai-usage-optimization.md)
- [ADR-0009: Self-Sustaining Engineering Ecosystem](./docs/adr/0009-self-sustaining-engineering-ecosystem.md)
- [ADR-0010: One Package = One Responsibility](./docs/adr/0010-one-package-one-responsibility.md)
- [ADR-0011: CLI and Directory Naming](./docs/adr/0011-cli-and-directory-naming.md)
- [ADR-0012: PNPM Meta-Workspace Setup](./docs/adr/0012-meta-workspace.md)
- [ADR-0013: Automation as a Survival Constraint](./docs/adr/0013-automation-survival-constraint.md)
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
    └── @kb-labs/plugin
  @kb-labs/knowledge
    └── @kb-labs/core

Orchestration Layer:
  @kb-labs/workflow
    └── @kb-labs/core
    └── @kb-labs/plugin
  @kb-labs/plugin
    └── @kb-labs/core
    └── @kb-labs/shared
  @kb-labs/setup-engine
    └── @kb-labs/core

AI Products Layer:
  @kb-labs/ai-review
    └── @kb-labs/core
    └── @kb-labs/plugin
  @kb-labs/ai-docs
    └── @kb-labs/core
    └── @kb-labs/mind
    └── @kb-labs/plugin
  @kb-labs/ai-tests
    └── @kb-labs/core
    └── @kb-labs/mind
    └── @kb-labs/plugin
  @kb-labs/analytics
    └── @kb-labs/core
    └── @kb-labs/shared
  @kb-labs/mind
    └── @kb-labs/core
    └── @kb-labs/shared

Infrastructure Layer:
  @kb-labs/rest-api
    └── @kb-labs/core
    └── @kb-labs/plugin
  @kb-labs/studio
    └── @kb-labs/ui
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
| AI Products | 7 | 5 | 2 | 0 |
| Orchestration | 3 | 3 | 0 | 0 |
| Tools & Infrastructure | 6 | 6 | 0 | 0 |
| Templates | 2 | 2 | 0 | 0 |
| **Total** | **23** | **21** | **2** | **0** |

### Health Metrics

- **Documentation Coverage**: 100% (all products have README, CONTRIBUTING, docs/DOCUMENTATION.md)
- **ADR Coverage**: 193+ ADRs across all projects
- **Standard Compliance**: All projects follow KB Labs Documentation Standard
- **Build Status**: All packages build successfully
- **Test Coverage**: Comprehensive test coverage across all packages

📈 **[View Ecosystem Health](./docs/ecosystem/HEALTH.md)** — Detailed health metrics and status

## 🤝 Contributing

> [!IMPORTANT]
> **Early Development Phase**
>
> KB Labs is currently in active development and **not accepting external contributions** at this time. The architecture is evolving rapidly with frequent breaking changes.
>
> **When we're ready for contributions (2026-2027):**
> - We'll announce on GitHub and social media
> - Contribution guidelines will be finalized
> - Stable APIs and architecture will be in place
>
> **For now**, you're welcome to explore the codebase, study the architecture, and provide feedback through GitHub Issues.

### Future Contribution Areas (Post-Public Release)

Once the platform stabilizes, we'll welcome contributions in:

- **Code**: Bug fixes, new features, performance improvements
- **Documentation**: ADRs, guides, examples, API documentation
- **Architecture**: Propose new ADRs, review existing decisions
- **Testing**: Test coverage, integration tests, fixtures
- **Tooling**: DevKit improvements, CI/CD enhancements
- **Plugins**: Community-contributed plugins for the plugin marketplace

**Contribution Standards** (when accepting PRs):
- Follow DevKit presets and naming conventions
- Maintain comprehensive documentation
- Review relevant ADRs before architectural changes
- Submit PRs with clear descriptions and tests

📖 **[Read Contributing Guide](./CONTRIBUTING.md)** — Detailed guidelines (for future reference)

## 📄 License

**This repository** (kb-labs meta-workspace) is licensed under **MIT License** - see [LICENSE](./LICENSE) for details.

### Dual Licensing Across Ecosystem

KB Labs ecosystem uses a **dual-licensing approach** to balance community growth and business protection:

- **MIT License** — Developer tools and libraries (DevKit, Shared, SDK, Templates, Audit)
  - 6 repositories (29% of ecosystem)
  - Freely usable, modifiable, distributable
  - Encourages ecosystem growth and adoption

- **KB Public License v1.1** — Core platform components (Mind, CLI, REST API, Workflow, etc.)
  - 15 repositories (71% of ecosystem)
  - Open source with restrictions on SaaS and competing products
  - ✅ Use, modify, self-host freely
  - ❌ No hosted services without permission
  - ❌ No competing products

**License Resources:**
- [LICENSE-SUMMARY.md](./LICENSE-SUMMARY.md) — Complete licensing breakdown
- [MIT License](./LICENSE-MIT) — Full MIT license text
- [KB Public License v1.1](./LICENSE-KB-PUBLIC) — Full KB Public license text
- [License Guide (English)](./LICENSE-GUIDE.en.md) — Detailed usage guide
- [Руководство по лицензии (Русский)](./LICENSE-GUIDE.ru.md) — Детальное руководство

**Commercial Licensing:**
For commercial licensing inquiries: contact@kblabs.dev

---

**KB Labs** — *Building the future of AI-powered development*

*Last updated: December 2025*
