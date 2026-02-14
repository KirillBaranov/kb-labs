# KB Labs

> OSS platform for building company automations where teams write business logic, and the platform handles infrastructure, observability, and cost control.

**Status:** Active development (private beta)  
**Deployment:** On-prem now, managed SaaS planned  
**Focus today:** Engineering automations (commits, releases, quality checks, internal agents)  
**Core principle:** No vendor lock-in via adapter-first infrastructure

[![GitHub](https://img.shields.io/badge/GitHub-kb--labs-blue)](https://github.com/KirillBaranov/kb-labs)
[![Discussions](https://img.shields.io/badge/Discussions-Ask%20Questions-green)](https://github.com/KirillBaranov/kb-labs/discussions)
[![Contact](https://img.shields.io/badge/Email-contact%40kblabs.dev-red)](mailto:contact@kblabs.dev)

## What KB Labs Is

KB Labs is a platform for internal automation in companies.

You build automations as plugins. Plugin authors focus on business logic only. The platform provides:

- execution runtime
- observability (logs, metrics, incidents)
- analytics
- permissions and isolation
- infrastructure adapters (cache, DB, LLM, vector store, logger, metrics)

Result: teams deliver automations faster and keep centralized control over reliability and cost.

## Who It Is For

KB Labs is for teams that:

- build many internal automations and want one platform instead of many scripts/services
- need centralized visibility for automation health and spending
- want to avoid vendor lock-in and keep infrastructure choices flexible
- have platform/infra engineering maturity (or are building it)

Not a fit if you need a fully production-ready, plug-and-play SaaS right now.

## 30-Second Explanation

Most automation stacks force teams to repeatedly solve infra problems: runtime, retries, logging, metrics, cost visibility, and migrations.

KB Labs separates concerns:

- plugin = business logic
- platform = infra and operations

So teams can ship automations faster, while platform owners keep control and can swap infrastructure without rewriting modules.

## Why Teams Choose KB Labs

- **Faster TTM:** less time on platform plumbing for each new automation
- **Lower costs:** shared runtime and centralized governance instead of duplicated infra
- **Centralized control:** one place for observability and analytics across automations
- **Vendor freedom:** adapters let you switch infra backends via config, not rewrites
- **Scalable model:** internal plugin ecosystem now, marketplace-ready model later

## How It Works

### 1. Build plugins
Teams implement only domain logic for their automation.

### 2. Run on shared platform runtime
Platform handles execution modes, integration surface, and operational concerns.

### 3. Observe and control centrally
You get unified telemetry, incident visibility, and analytics for all automations.

### 4. Swap infrastructure safely
Infrastructure dependencies are abstracted by adapters.

```json
{
  "platform": {
    "adapters": {
      "cache": "@kb-labs/adapters-redis",
      "db": "@kb-labs/adapters-postgres",
      "vectorStore": "@kb-labs/adapters-qdrant",
      "llm": "@kb-labs/adapters-openai"
    }
  }
}
```

Change adapter config, keep business modules working.

## Current Real Use Cases

KB Labs is already used internally to automate:

- commit generation
- release workflows
- quality control checks
- internal agent workflows
- monorepo health operations

These are the current dogfooding scenarios that drive the platform roadmap.

## What You Can Expect Today

### Working now

- adapter-first platform architecture
- plugin-based automation model
- DevKit tooling for monorepo operations
- observability and monitoring foundation
- internal workflow and automation tooling

### In progress

- production hardening and broader test coverage
- smoother external onboarding and setup experience
- expanded documentation and quick-start paths
- plugin ecosystem expansion

## What Makes KB Labs Different

### Plugin-first, not script-first
Automations are platform-native plugins, not disconnected scripts.

### Platform-owned infrastructure
Automation developers do not re-implement infra concerns every time.

### Centralized observability and cost visibility
Platform owners see health and economics of automations in one place.

### Adapter-first by design
Infrastructure choices are decoupled from business automation code.

## Quick Product Map

- **Core platform:** runtime, contracts, plugin system
- **CLI + REST API:** interfaces for users and integrations
- **Mind / AI tools:** semantic and automation-assist features
- **DevKit:** monorepo and package operations
- **Studio:** observability and platform visibility
- **Release and quality modules:** automation for delivery workflows

## Architecture

High-level architecture and deep technical breakdown:

- [Architecture Deep Dive](./docs/ARCHITECTURE.md)

Ecosystem references:

- [Products Overview](./docs/products/README.md)
- [Roadmap](./docs/roadmap/README.md)
- [Ecosystem Status](./docs/ecosystem/STATUS.md)
- [Ecosystem Health](./docs/ecosystem/HEALTH.md)

## Screenshots and Demos

Real screenshots and demo artifacts:

- [Screenshots Index](./docs/screenshots/README.md)

Includes:

- Studio dashboard views
- commit automation output
- infrastructure adapter swap demo

## Documentation

Start here:

- [Documentation Index](./docs/README.md)
- [CLI Reference](./docs/CLI-REFERENCE.md)
- [ADR Index](./docs/adr/)

## Contributing

KB Labs is in active development and external contributions are temporarily paused while contracts and architecture continue to stabilize.

You can still:

- explore the codebase
- open issues and feedback
- follow progress in discussions

Details:

- [Contributing Guide](./CONTRIBUTING.md)
- [GitHub Discussions](https://github.com/KirillBaranov/kb-labs/discussions)

## License

KB Labs uses dual licensing.

In short:

- Most core KB Labs components are under KB Public License.
- Reusable libraries and tooling are under MIT.
- Internal company use is allowed.
- Offering KB Labs as a hosted competing service requires a commercial license.

- [KB Public License](./LICENSE-KB-PUBLIC)
- [MIT License](./LICENSE-MIT)
- [License Summary](./LICENSE-SUMMARY.md)
- [License Guide (EN)](./LICENSE-GUIDE.en.md)
- [License Guide (RU)](./LICENSE-GUIDE.ru.md)

## Contact

**Kirill Baranov**

- [GitHub](https://github.com/KirillBaranov)
- [LinkedIn](https://www.linkedin.com/in/k-baranov/)
- [Telegram channel (RU)](https://t.me/kirill_baranov_official)
- [Telegram](https://t.me/kirill_baranov)
- Email: kirillBaranovJob@yandex.ru

---

If you evaluate KB Labs, the quickest mental model is:

**"Platform for company automations: plugin business logic in, infrastructure/observability/cost control out."**
