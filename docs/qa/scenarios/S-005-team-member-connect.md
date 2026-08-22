---
id: S-005
title: Team Member — Connect to Cloud
persona: team-member
priority: P1
automation: manual
e2e: —
---

## Goal

A team member gets CLI access to a cloud-deployed KB Labs platform.
They should be able to run AI commands (commit, review) through the team's shared gateway
without managing their own LLM credentials.

## Prerequisites

- [ ] Platform is deployed and healthy (S-004 passed)
- [ ] Admin has created an account for the member
- [ ] Member has: Node 20+, internet access, no prior KB Labs install

---

## Steps

### Phase 1 — Install & connect

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `curl -fsSL https://kblabs.ru/install.sh \| sh` | `kb-create` installed | | ⬜ |
| 2 | `kb-create apply --index <release-index> --request-platform-root <platform> --project-root <project>` | Project pointer generated and selected platform applied from the sealed index | | ⬜ |
| 3 | `.env` or config contains team platform URL, no personal LLM key | Member is not using their own key | | ⬜ |

### Phase 2 — Authentication

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `kb auth login` (or equivalent) | Prompts for credentials, authenticates against team platform | | ⬜ |
| 5 | `kb auth status` | Shows logged-in user and connected platform URL | | ⬜ |

### Phase 3 — Run commands through team gateway

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Make a change, `git add .`, `kb commit commit --dry-run` | Runs via team gateway, `LLM: Phase` in output | | ⬜ |
| 7 | `kb review run` | Code review runs via team gateway | | ⬜ |
| 8 | `kb workflow list` | Lists workflows available on team platform | | ⬜ |

### Phase 4 — Isolation check

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | Member cannot see other members' run history | Runs list shows only own runs | | ⬜ |
| 10 | Member cannot access admin panel in Studio | 403 or no admin menu shown | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- Identity (TD-4) and permissions (TD-8) are not yet fully implemented — steps 4,9,10 may be partially manual
- Fleet distribution (TD-6/7) open — plugin availability on client may differ from server
