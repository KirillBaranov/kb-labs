---
id: S-020
title: Studio — First login
persona: solo-developer
priority: P0
automation: manual
e2e: —
---

## Goal
Developer opens Studio in browser, logs in, and sees the dashboard.

## Prerequisites
- [ ] Platform installed, `kb-dev start` done
- [ ] Studio running on port 3000 (or 3002 behind nginx)
- [ ] Browser available

---

## Steps

### Phase 1 — Load Studio

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Open `http://localhost:3000` | Studio loads, no blank page, no JS errors in console | | ⬜ |
| 2 | Login page appears | Has username + password fields | | ⬜ |
| 3 | Page loads in < 3s | No noticeable lag | | ⬜ |

### Phase 2 — Login

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Enter valid credentials (admin@... / password) | Login succeeds, redirects to dashboard | | ⬜ |
| 5 | Dashboard shows platform status (services, plugins) | Data visible, not empty | | ⬜ |
| 6 | No JS errors in browser console after login | Console clean | | ⬜ |

### Phase 3 — Wrong credentials

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Enter wrong password | "Invalid credentials" shown — not blank/crash | | ⬜ |
| 8 | After 5 wrong attempts | Rate limit message — not silent 429 | | ⬜ |

### Phase 4 — Session

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | Refresh page after login | Stays logged in | | ⬜ |
| 10 | Close tab, reopen Studio | Session persists (or re-login prompted cleanly) | | ⬜ |

---

## Result
## Bugs
## Notes
