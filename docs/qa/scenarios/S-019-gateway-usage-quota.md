---
id: S-019
title: Gateway — Usage and quota
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer can view how many LLM requests they've used and what their quota is.

## Prerequisites
- [ ] KB Labs installed with KB Labs Gateway credentials
- [ ] At least 1 LLM request made (from S-014 or similar)

---

## Steps

### Phase 1 — View usage

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb gateway usage` (or similar command) | Shows requests used / quota remaining | | ⬜ |
| 2 | `kb gateway usage --json` | Machine-readable: `{used, limit, resetAt}` | | ⬜ |
| 3 | Usage increments after each LLM call | Count goes up | | ⬜ |

### Phase 2 — Quota enforcement

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Approach quota limit | Warning shown before hitting limit | | ⬜ |
| 5 | Exceed quota | Clear message: "quota exceeded, upgrade or use own key" — not silent 401 | | ⬜ |

### Phase 3 — Studio view (if implemented)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Open Studio → Gateway / Usage section | Usage chart visible | | ⬜ |
| 7 | Data matches CLI output | Consistent numbers | | ⬜ |

---

## Result
## Bugs
## Notes
