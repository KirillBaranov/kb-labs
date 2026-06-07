---
id: S-018
title: Gateway — Switch LLM provider
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer switches LLM provider (e.g. OpenAI → Anthropic → VibeProxy) without reinstalling platform.
All AI commands continue to work after switch.

## Prerequisites
- [ ] KB Labs installed, services running
- [ ] At least two provider keys available

---

## Steps

### Phase 1 — Check current provider

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `curl http://localhost:4000/health` | Shows current LLM adapter name | | ⬜ |
| 2 | `cat .kb/kb.config.json` | `adapters.llm` shows current provider | | ⬜ |

### Phase 2 — Switch provider

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | Edit `adapters.llm` in `.kb/kb.config.json` | Config saved | | ⬜ |
| 4 | `kb-dev restart` | Services restart with new config | | ⬜ |
| 5 | `/health` shows new provider | Adapter switched | | ⬜ |
| 6 | `kb commit commit --dry-run` | Uses new provider | | ⬜ |

### Phase 3 — VibeProxy (if configured)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Set `adapters.llm` to `vibeproxy`, configure proxy URL | Config valid | | ⬜ |
| 8 | AI commit works through proxy | Proxied request succeeds | | ⬜ |

### Phase 4 — Invalid provider config

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | Set unknown adapter name | Clear error at startup, not silent fail | | ⬜ |
| 10 | Missing required field for provider | Validation error with hint | | ⬜ |

---

## Result
## Bugs
## Notes
