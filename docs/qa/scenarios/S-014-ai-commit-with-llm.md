---
id: S-014
title: AI Commit — with real LLM
persona: solo-developer
priority: P0
automation: e2e-done
e2e: domain workflow E2E; the V2 post-publish journey covers the installed
  plugin/workflow path, while LLM credentials remain a domain concern
---

## Goal
Developer stages changes and generates an AI commit message using a real LLM (not heuristic fallback).
Requires valid gateway credentials.

## Prerequisites
- [ ] KB Labs installed with valid `.env` (KB_GATEWAY_CLIENT_ID + KB_GATEWAY_CLIENT_SECRET)
- [ ] Git repo with staged changes
- [ ] Gateway reachable at `https://api.kblabs.ru`

---

## Steps

### Phase 1 — Dry run

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Stage changes: `git add <file>` | Changes staged | | ⬜ |
| 2 | `kb commit commit --dry-run` | Output contains `LLM: Phase` — real LLM used | | ⬜ |
| 3 | Proposed commit message is meaningful (not generic) | Not `chore(.): update configuration` | | ⬜ |
| 4 | Dry run does NOT create a commit | `git log` unchanged | | ⬜ |

### Phase 2 — Real commit

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `kb commit commit --yes` | Commit created with AI message | | ⬜ |
| 6 | `git log --oneline -1` | Message follows conventional commits format | | ⬜ |
| 7 | Message describes actual change (not generic) | Meaningful message | | ⬜ |

### Phase 3 — Multi-file changes

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | Stage changes across 3+ files | All files included in diff sent to LLM | | ⬜ |
| 9 | `kb commit commit --dry-run` | Commit message covers all changed areas | | ⬜ |

### Phase 4 — Edge cases

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 10 | No staged changes | Clear message: "nothing to commit" | | ⬜ |
| 11 | LLM timeout / network error | Graceful fallback to heuristic, not crash | | ⬜ |

---

## Result
## Bugs
## Notes
