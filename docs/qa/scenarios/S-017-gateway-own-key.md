---
id: S-017
title: Gateway — Connect own LLM key
persona: solo-developer
priority: P0
automation: manual
e2e: —
---

## Goal
Developer configures their own OpenAI (or other provider) API key instead of using KB Labs Gateway.
All AI commands use the configured key.

## Prerequisites
- [ ] KB Labs installed
- [ ] Own OpenAI API key available

---

## Steps

### Phase 1 — Configure

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Add `OPENAI_API_KEY=sk-...` to `.env` | Key present in env | | ⬜ |
| 2 | Edit `.kb/kb.config.json` to set `adapters.llm` to `openai` | Config updated | | ⬜ |
| 3 | `kb-dev restart` or restart services | Services pick up new config | | ⬜ |

### Phase 2 — Verify LLM works

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `curl http://localhost:4000/health` | `adapters.llm.available: true` | | ⬜ |
| 5 | `kb commit commit --dry-run` | `LLM: Phase` in output — real LLM, not heuristic | | ⬜ |
| 6 | `kb review run` | Review uses LLM | | ⬜ |

### Phase 3 — Switch back to KB Labs Gateway

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Remove `OPENAI_API_KEY`, restore gateway config | Gateway adapter active | | ⬜ |
| 8 | `kb commit commit --dry-run` | Uses gateway LLM | | ⬜ |

### Phase 4 — Invalid key

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | Set invalid `OPENAI_API_KEY=sk-fake` | Clear error on first LLM call — not silent | | ⬜ |
| 10 | Gateway health shows llm unavailable | `adapters.llm.available: false` | | ⬜ |

---

## Result
## Bugs
## Notes
