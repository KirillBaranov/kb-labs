
# ADR-0008: AI Usage Optimization

**Date:** 2025-09-22
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [process, observability]  

## Context

KB Labs heavily relies on AI tools (Cursor, ChatGPT, background agents) for code migration, architecture, documentation, and testing. Initial usage patterns consumed excessive tokens (500k–1M per run), leading to costs of $0.15–0.30 per operation.

With sustained use, this posed a risk of exceeding monthly budgets and unsustainable spending patterns.

## Decision

We adopt a token-efficient workflow for AI usage across KB Labs projects:
- Use scoped prompts (1 module → 1 check → 1 summary)
- Avoid full-repo diffs unless strictly necessary
- Prefer incremental checks (per package) instead of monolithic runs
- Define budgets: $50/month variable + $20 base subscription (as of September 2025)
- Document these practices for all contributors to ensure consistency

## Rationale

- **Cost Control**: Keeps AI useful without uncontrolled spending
- **Efficiency**: Focuses AI power on high-leverage tasks (migrations, architecture, boilerplate)
- **Sustainability**: Aligns with CTO-level goal of predictable and sustainable costs
- **Scalability**: Enables consistent practices across all team members

## Consequences

**Positive:**
- 5–10× reduction in token usage
- Stable monthly costs under budget
- Contributors follow a repeatable playbook
- Better focus on high-value AI tasks

**Negative:**
- Requires discipline in prompt writing
- Slightly more manual splitting of tasks
- Initial learning curve for new contributors

## Alternatives Considered

- **Unlimited AI usage** — rejected (unsustainable costs)
- **Manual-only approach** — rejected (loses AI productivity benefits)
- **Fixed token limits** — rejected (too rigid, doesn't account for project complexity)

## Follow-ups

- Maintain a playbook of effective prompts inside KB Labs docs
- Add a budget monitor (scripts to track token burn per project)
- Review ADR every 6 months to adjust practices
- Create prompt templates for common tasks (migration, testing, documentation)