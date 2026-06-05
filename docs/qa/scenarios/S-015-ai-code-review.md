---
id: S-015
title: AI Code Review
persona: solo-developer
priority: P0
automation: manual
e2e: —
---

## Goal
Developer runs AI code review on their changes and receives actionable feedback.

## Prerequisites
- [ ] KB Labs installed, `ai-review` plugin installed
- [ ] Valid gateway credentials (or own LLM key configured)
- [ ] Git repo with uncommitted or committed changes

---

## Steps

### Phase 1 — Basic review

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Make a change with a deliberate code smell | File staged or in last commit | | ⬜ |
| 2 | `kb review run` | Review runs, output visible | | ⬜ |
| 3 | Output contains findings with file+line references | Findings are specific, not generic | | ⬜ |
| 4 | Exit code 0 even if issues found | Review is informational, not blocking | | ⬜ |

### Phase 2 — Modes

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `kb review run --mode=full` | Full review (more thorough) | | ⬜ |
| 6 | `kb review run --mode=quick` | Quick review (less detail, faster) | | ⬜ |
| 7 | `kb review run --json` | Machine-readable JSON output | | ⬜ |

### Phase 3 — Scope

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | `kb review run --files src/foo.ts` | Reviews only specified file | | ⬜ |
| 9 | Review with no changes staged | Handles gracefully: "nothing to review" or reviews HEAD | | ⬜ |

### Phase 4 — LLM fallback

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 10 | Review without valid credentials | Falls back to heuristic review or clear error | | ⬜ |

---

## Result
## Bugs
## Notes
