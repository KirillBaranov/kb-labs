# ADR-0007: AI Budget and ROI Tracking

**Date:** 2025-01-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [process, observability]  

## Context

KB Labs actively uses AI tools (Cursor, OpenAI, agents) in development. Previously, the budget was ≈$0, but over the past months it has grown to $100/month. This reflects a transition from "experiments" to systematic investments in Dev Productivity.

Without a transparent approach, it's easy to lose understanding of: where money goes, how many tasks are completed, what time savings are achieved. For CTO-scale operations, a system for control and ROI (return on investment) evaluation is needed.

## Decision

We introduce AI Budget & ROI Tracking practices:
- Create a separate document (`/docs/BUDGET.md`) where we track:
  - 🧾 Budget by categories: DevTools, Compute, Content/Docs
  - 📊 Actual monthly expenses
  - ⚡ Time savings (example: "core migration cost 35¢ instead of 3 hours")
- In ADR/Wiki, specify budget boundaries: target level $100–150/month in 2025, with possible growth to $200/month in 2026
- Establish key KPI: cost of development hour should be significantly higher than cost of AI assistance → meaning investments are justified

## Rationale

- **Transparency:** Clear visibility of where money goes
- **Control:** Easier to understand when to upgrade plans (e.g., Cursor Pro)
- **ROI:** Ability to justify expenses (e.g., in interviews or blog posts) — "$100 saves 30–40 hours per month"

## Consequences

**Positive:**
- Systematic approach to costs
- Ability to plan budget like in a real company
- Additional content for public sharing ("here's how we invest in AI productivity")

**Negative:**
- Need to spend some time on accounting (enter data weekly/monthly)
- Budget may grow faster than planned (need to monitor balance)

## Alternatives Considered

- **No tracking** — rejected (risks: loss of control, inability to show ROI)
- **Tracking only in Obsidian without ADR** — rejected (less systematic, but faster)

## Follow-ups

- Introduce Monthly Budget Log template in Obsidian
- Publish quarterly "Budget vs ROI" notes on Medium/LinkedIn