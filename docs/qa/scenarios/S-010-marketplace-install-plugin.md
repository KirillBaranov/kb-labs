---
id: S-010
title: Marketplace — Install plugin
persona: solo-developer
priority: P0
automation: manual
e2e: —
---

## Goal
Developer discovers a plugin in the marketplace and installs it. Plugin commands appear in CLI after install.

## Prerequisites
- [ ] Platform installed, `kb-dev start` done
- [ ] Internet access (marketplace registry)

---

## Steps

### Phase 1 — Discover

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb marketplace plugins list` | Shows available plugins with name/description/version | | ⬜ |
| 2 | `kb marketplace plugins list --json` | Valid JSON, machine-readable | | ⬜ |
| 3 | `kb marketplace search <query>` (if exists) | Returns relevant plugins | | ⬜ |

### Phase 2 — Install

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `kb marketplace install <plugin-name>` | Downloads, installs, shows success | | ⬜ |
| 5 | `kb --help` after install | New plugin commands visible | | ⬜ |
| 6 | `cat .kb/marketplace.lock` | Plugin entry added with version + integrity | | ⬜ |

### Phase 3 — Use installed plugin

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Run a command from the installed plugin | Command executes successfully | | ⬜ |

### Phase 4 — Install same plugin again (idempotency)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | `kb marketplace install <same-plugin>` | "Already installed" or no-op — not duplicate entry in lock | | ⬜ |

---

## Result
## Bugs
## Notes
