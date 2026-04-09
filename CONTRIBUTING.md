# Contributing to KB Labs

KB Labs is an open-source project and we're actively looking for people to explore it, break it, question it, and eventually build on top of it.

**We're in active development.** Some things are stable, some things are still moving. This guide explains what you can do right now and what to expect.

---

## How to Contribute (Right Now)

### Report Issues

If something breaks, behaves unexpectedly, or doesn't make sense — open an issue. We read every one.

Good issue = clear description + steps to reproduce + what you expected vs what happened.

[Open an issue →](https://github.com/KirillBaranov/kb-labs/issues)

### Start a Discussion

Architecture questions, use case feedback, "why did you design it this way", ideas for features, things you'd do differently — all of this belongs in Discussions.

[GitHub Discussions →](https://github.com/KirillBaranov/kb-labs/discussions)

### Build an Adapter

The adapter interface is stable and this is the most impactful thing you can do right now if you have a specific infrastructure need.

KB Labs ships with ~21 adapters (OpenAI, SQLite, MongoDB, Redis, Qdrant, Pino, Docker, etc.). But the adapter contract is open, and you can implement any backend you need.

Common requests: Kafka, RabbitMQ, NATS, DynamoDB, Postgres, Pinecone, Anthropic, Vertex AI.

Adapter interface lives in `@kb-labs/core-contracts`. Look at any existing adapter in `infra/kb-labs-adapters/` for a working reference.

**Process:** Open an issue describing what you're building → we'll confirm the interface is the right one → build and submit PR.

### Build a Plugin

Plugins are TypeScript packages with a declared manifest. If you have an automation use case (code quality, deployment, notifications, data sync, anything), it probably belongs as a plugin.

Reference structure: `plugins/kb-labs-commit-plugin/` — clean three-package layout (contracts, core, cli).

**Process:** Open an issue with a short description of what the plugin does → discuss scope → build.

### Improve Documentation

If you read a doc and came away confused, a PR with clarification is immediately useful. No need to ask first.

### Review Architecture Decisions

ADRs are in [docs/adr/](./docs/adr/). If you disagree with a decision or see a case we didn't consider, open a discussion. Architecture is still evolving and outside perspective is valuable.

---

## Code Contributions (Features & Core Changes)

The architecture is still stabilizing in some areas. Before investing significant time in a feature or refactor, **open an issue first** to align on scope and approach.

What we're currently careful about:
- Plugin contracts and adapter interfaces (stable, but we want to keep them clean)
- Workflow engine internals (in active development)
- CLI command structure (evolving)

What's relatively safe to touch:
- Adapters
- Individual plugins
- Documentation
- Tests
- DevKit tooling

---

## Development Setup

### Prerequisites

- Node.js ≥ 18.18
- pnpm ≥ 9

### Setup

```bash
git clone https://github.com/KirillBaranov/kb-labs.git
cd kb-labs
pnpm install
pnpm build
```

### Common Commands

```bash
pnpm build            # Build all packages
pnpm lint             # ESLint across all packages
pnpm type-check       # TypeScript type checking
pnpm test             # Run tests
pnpm check            # lint + type-check + test
```

### After Building a Plugin

If you build or modify a CLI plugin, always clear the cache:

```bash
pnpm kb marketplace clear-cache
```

---

## Commit Messages

Use conventional commit format:

```
feat: add Kafka adapter
fix: resolve timeout in workflow executor
docs: clarify adapter interface
refactor: extract retry logic to shared utility
test: add coverage for budget middleware
chore: bump pnpm to 9.5
```

---

## Pull Request Guidelines

- Open an issue first for anything non-trivial
- Keep PRs focused — one thing per PR
- Include what you changed and why in the description
- Add tests for new functionality where applicable
- Make sure `pnpm check` passes before submitting

---

## Architecture

Before making significant changes, read the relevant ADRs:

- [ADR-0001: Architecture and Repository Layout](./docs/adr/0001-architecture-and-repository-layout.md)
- [ADR-0002: Plugins and Extensibility](./docs/adr/0002-plugins-and-extensibility.md)
- [ADR-0003: Package and Module Boundaries](./docs/adr/0003-package-and-module-boundaries.md)
- [ADR-0005: Layering & Stability Policy](./docs/adr/0005-layering-stability-policy.md)

---

## Questions?

Open a [GitHub Discussion](https://github.com/KirillBaranov/kb-labs/discussions) or email [contact@kblabs.dev](mailto:contact@kblabs.dev).

The project is built by one person right now. Response times may vary, but everything gets read.
