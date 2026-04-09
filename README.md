# KB Labs

**Open-source platform for dev and release automation.** Write business logic as plugins. The platform handles execution, observability, infrastructure, and cost control.

[![GitHub Discussions](https://img.shields.io/badge/Discussions-Join-green)](https://github.com/KirillBaranov/kb-labs/discussions)
[![Issues](https://img.shields.io/badge/Issues-Open-blue)](https://github.com/KirillBaranov/kb-labs/issues)
[![License](https://img.shields.io/badge/License-KB%20Public-orange)](./LICENSE-KB-PUBLIC)
[![Email](https://img.shields.io/badge/Email-contact%40kblabs.dev-red)](mailto:contact@kblabs.dev)

---

## What is KB Labs

KB Labs is an open-source platform for engineering teams who are tired of fragile automation stacks — shell scripts scattered across repos, CI YAML that nobody wants to touch, manual release steps that live in someone's head, and AI agents that run ungoverned on a laptop.

The idea is simple: **you write the business logic, the platform handles the rest.**

```typescript
// A release workflow. No infra code, no boilerplate.
export const releaseWorkflow = defineWorkflow({
  steps: [
    runTests(),
    runQAGate(),
    aiReview({ mode: 'full' }),
    requireApproval({ from: 'team-lead' }),
    publish({ tag: 'latest' }),
  ],
});
```

Platform provides: execution runtime, observability, analytics, permissions, and a unified adapter layer for every external dependency (LLM, cache, DB, vector store, event bus, etc.).

Switch infrastructure without touching your automation code:

```json
{
  "adapters": {
    "llm": "@kb-labs/adapters-openai",
    "cache": "@kb-labs/adapters-redis",
    "db": "@kb-labs/adapters-sqlite"
  }
}
```

## What It Does Today

KB Labs ships with a growing set of built-in plugins, adapters, and workflows. These are the things we already use internally every day:

- **Commit plugin** — generates conventional commits using LLM, with secrets detection and two-phase analysis
- **Release manager** — orchestrates multi-repo release cycles with changelogs, QA gates, and AI review
- **QA plugin** — runs regression checks across 100+ packages, tracks trends, detects failures at commit time
- **AI review** — pluggable code review gate with ESLint + LLM combined analysis
- **Mind** — semantic code search and RAG across the entire codebase
- **DevKit** — 18 tools for monorepo health: imports, exports, types, build order, dependency fixing
- **Gateway** — unified adapter contracts for LLMs, databases, caches, vector stores, event buses, and more

**~21 adapters available out of the box:** OpenAI, SQLite, MongoDB, Redis, Qdrant, Pino, Docker, filesystem, git, and more.

## Current Status

**Honest assessment:** KB Labs is in active development. It works end-to-end and we run it on real workloads, but it's not yet polished for broad external use. Setup takes effort. Documentation has gaps. Some APIs will change.

If you're evaluating: this is the right time to explore, give feedback, and influence the direction — before things solidify.

**Working now:**
- Adapter-first platform architecture (zero-lock-in by design)
- Plugin execution runtime with sandbox, permissions, audit
- Workflow engine with dependency resolution and state management
- CLI + REST API + Studio dashboard
- Built-in plugins (commit, release, QA, AI review, Mind, DevKit)
- DevLink — cross-repo dependency management
- Multi-tenancy primitives (quotas, rate limiting, tenant isolation)

**In progress:**
- Better onboarding and quickstart experience
- Broader test coverage and production hardening
- Plugin marketplace and public registry
- Managed SaaS (self-hosted is the primary path today)

## Architecture Overview

```
CLI / REST API / Studio
        ↓
  Gateway (:4000)
        ↓
  Platform Core
  ├── Workflow Engine
  ├── Plugin Runtime (sandbox + permissions)
  ├── Adapter Layer (LLM / DB / Cache / ...)
  └── Observability (logs, metrics, incidents)
```

Plugins are isolated units of business logic. The platform handles execution, lifecycle, and all infrastructure dependencies through registered adapters.

Deeper reads:
- [Architecture Deep Dive](./docs/ARCHITECTURE.md)
- [Products Overview](./docs/products/README.md)
- [ADR Index](./docs/adr/) — architecture decisions with full context

## Getting Started

> Full setup guide is coming. For now, here's the shape of it.

**Prerequisites:** Node.js ≥ 18.18, pnpm ≥ 9

```bash
# Install KB Labs globally
npm install -g @kb-labs/cli

# Initialize a new project
kb init my-project
cd my-project

# Start the dev environment (local services)
kb-dev start

# Run your first workflow
kb workflow:run --workflow-id=example
```

Plugin development quickstart and full CLI reference: [CLI-REFERENCE.md](./docs/CLI-REFERENCE.md)

## Contributing

KB Labs is open-source and we want your involvement — even right now, before the project is "ready."

**Things you can do today:**

- **Open an issue** — bugs, confusing design decisions, missing docs, feature requests. We read everything.
- **Start a discussion** — questions about architecture, ideas, use cases. [GitHub Discussions](https://github.com/KirillBaranov/kb-labs/discussions)
- **Build an adapter** — the adapter interface is stable. If you need Kafka, RabbitMQ, NATS, DynamoDB, or anything else, you can build it today. We'll help.
- **Build a plugin** — plugins are TypeScript packages with a declared manifest. If you have an automation use case, it belongs here.
- **Review ADRs** — architectural decisions are documented. Disagree with something? Open a discussion.
- **Improve docs** — if something is unclear, a PR with clarification is always welcome.

For code contributions (new features, core changes): the architecture is still evolving, so please open an issue first before investing significant time. We want to make sure the direction is aligned.

Full guide: [CONTRIBUTING.md](./CONTRIBUTING.md)

## Project Structure

KB Labs is a multi-repo monorepo. Here's what lives where:

```
platform/   — core (runtime, CLI, workflow engine, REST API, Studio, SDK, marketplace)
plugins/    — built-in plugins (agents, mind, devlink, commit, ai-review, QA, ...)
infra/      — infrastructure (plugin system, adapters, gateway, devkit)
templates/  — starter templates for plugins and products
installer/  — Go-based CLI launcher (kb-create)
```

Most code you'd want to explore lives in `platform/` and `plugins/`.

## Roadmap

KB Labs is building toward a public launch in mid-2026. High-level priorities:

1. **Stabilize core APIs** — plugin contracts, adapter interfaces, workflow schema
2. **Public onboarding** — quickstart, templates, example projects
3. **Plugin marketplace** — public registry for discovering and installing plugins/adapters
4. **Managed SaaS** — hosted option for teams who don't want to self-host
5. **Enterprise features** — SSO, audit logs, RBAC, compliance

Full roadmap: [docs/roadmap/README.md](./docs/roadmap/README.md)

## License

KB Labs uses dual licensing:

- **Core platform** → [KB Public License](./LICENSE-KB-PUBLIC) — use freely, including internal company deployments. Hosting KB Labs as a competing commercial service requires a separate license.
- **Libraries and tooling** → [MIT](./LICENSE-MIT) — no restrictions.

Quick read: [License Summary](./LICENSE-SUMMARY.md) | [License Guide EN](./LICENSE-GUIDE.en.md)

## Community

- [GitHub Discussions](https://github.com/KirillBaranov/kb-labs/discussions) — questions, ideas, architecture discussions
- [GitHub Issues](https://github.com/KirillBaranov/kb-labs/issues) — bugs, feature requests
- Email: [contact@kblabs.dev](mailto:contact@kblabs.dev)

## About

KB Labs is built by [Kirill Baranov](https://github.com/KirillBaranov) — a solo founder building the platform I always wanted as an engineer.

The goal: give developers back control over their automation stack. One engine for the dev loop. No vendor lock-in. No platform tax every time you need a new automation. Open-source, self-hosted by default, honest about what it is.

- [LinkedIn](https://www.linkedin.com/in/k-baranov/)
- [Telegram (RU)](https://t.me/kirill_baranov_official)
- [kblabs.dev](https://kblabs.dev)
