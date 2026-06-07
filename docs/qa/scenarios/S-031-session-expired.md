---
id: S-031
title: Session expired — clear prompt to re-login
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Session expires while working. KB Labs tells the user clearly and continues gracefully.

## Prerequisites
- [ ] KB Labs installed with gateway credentials (or expired state)

---

## Steps

### Phase 1 — Token expiry during CLI use

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb auth status` with expired token | Shows expiry state clearly | `Token: expired (will auto-refresh on next request)` | ✅ |
| 2 | Run any command with expired token | Clear prompt to re-login | `[commit] LLM failed, falling back to heuristics: 401 "Unauthorized"` — falls back silently, no re-login prompt | ⚠️ |
| 3 | Error distinct from "not configured" | Different message | Same `401 "Unauthorized"` for both cases — not distinct | ❌ |

### Phase 2 — Auto-refresh

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Token near expiry — silently refreshed | User never sees it | Auth status says "will auto-refresh" — mechanism exists | ✅ |
| 5 | Refresh succeeds | Command works | Not tested (need valid gateway creds) | ⬜ |
| 6 | Both tokens fully expired | Explicit re-login prompt | Falls back to heuristics silently — no prompt | ❌ |

### Phase 3 — Studio session

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Studio session expires | Redirect to login with message | Not tested — no Studio login (B-023) | ⬜ |

### Phase 4 — Server restart

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | `kb-dev restart` invalidates tokens | Re-login prompted | Not tested | ⬜ |

---

## Result

**PARTIAL** — Auth status correctly shows expiry. Auto-refresh mechanism exists.
But expired session silently falls back to heuristics instead of prompting user to re-login.
User never knows their LLM stopped working.

## Bugs

| ID | Priority | Description |
|---|---|---|
| B-033 | P1 | Expired/invalid credentials fall back to heuristics silently — user gets worse output without knowing why. Should prompt to refresh credentials. |
| B-034 | P1 | No distinction between "credentials expired" and "credentials not configured" — both give same `401 "Unauthorized"` |

## Notes

- Run date: 2026-06-05. Platform 2.94.0.
- `kb auth status` correctly shows `Token: expired (will auto-refresh on next request)`.
