# ADR-0002: Plugins and Extensibility

**Date:** 2025-09-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, api]

## Context

KB Labs products are designed to be reusable across different stacks, domains, and teams. To ensure long-term scalability, all products (AI Review, AI Docs, AI Tests, etc.) must support a flexible plugin & extension system. Without this, every new feature would require hardcoding into the core, increasing maintenance burden and reducing adaptability.

## Decision

- Each KB Labs product must expose a plugin API that allows third-party developers (or other KB Labs packages) to extend behavior without modifying the core
- The plugin system must be:
  1. **Isolated** — Plugins run in a sandboxed scope and cannot break the core
  2. **Composable** — Multiple plugins can be combined in one pipeline
  3. **Discoverable** — Plugins are registered via a central registry (`plugins/index.ts`) or a configuration file (`.kblabsrc.json`)
  4. **Typed** — All plugin interfaces must be defined in `@kb-labs/core` using TypeScript types and Zod schemas
  5. **Cross-product** — The same plugin (e.g., a Slack notifier) can be reused in AI Review, AI Docs, and AI Tests without rewriting

## Examples

- **AI Review** — rule providers, LLM strategies, custom output formatters
- **AI Docs** — content generators, format exporters (Markdown, HTML, Confluence)
- **AI Tests** — test strategy plugins, snapshot comparators
- **Shared** — analytics/logging, secret providers, budget control

## Consequences

**Positive:**

- Easier to onboard contributors: they extend via plugins instead of modifying the core
- Ensures product consistency: every KB Labs product has the same extensibility model
- Avoids long-term lock-in

**Negative:**

- Core complexity increases slightly
- Additional abstraction layer to maintain

## Alternatives Considered

- **Hardcoded integrations** — rejected (not scalable, not reusable)
- **Separate extension repositories** — rejected (too fragmented, harder to maintain)
