---
id: PC-001
area: platform-core
title: Clean install from scratch
priority: P0
env: fresh machine (no KB Labs)
---

## Goal

A developer installs KB Labs on a clean machine, creates a project, and has a working
`kb` CLI with all core commands available — without any prior KB Labs knowledge.

## Environment

- [ ] No `kb-create`, `kb-dev`, `kb` in PATH
- [ ] Node.js 20+ installed (`node --version`)
- [ ] `git` installed
- [ ] Internet access
- [ ] Empty working directory

---

## Steps

### Phase 1 — Install kb-create

| # | Action | Expected |
|---|--------|----------|
| 1 | `curl -fsSL https://kblabs.ru/install.sh \| sh` | Installer runs without errors, prints success message |
| 2 | Open a new terminal (or `source ~/.zshrc`) | — |
| 3 | `kb-create --version` | Prints version (e.g. `2.94.0`), no error |
| 4 | `kb-dev --version` | Prints version |
| 5 | `which kb-create kb-dev` | Both resolve to paths under `~/.local/bin` or similar |

### Phase 2 — Create project

| # | Action | Expected |
|---|--------|----------|
| 6 | `kb-create my-project --yes` | Directory `my-project/` created, no errors in output |
| 7 | `cd my-project` | — |
| 8 | `ls .kb/` | Contains `kb.config.json`, `marketplace.lock` |
| 9 | `cat .kb/kb.config.json` | Valid JSON, no placeholder values like `"YOUR_KEY"` |
| 10 | `cat .kb/marketplace.lock` | Valid JSON with at least one entry |

### Phase 3 — Verify CLI

| # | Action | Expected |
|---|--------|----------|
| 11 | `kb --help` | Lists available commands, no `Unknown command` or stack trace |
| 12 | `kb --version` | Prints version matching `kb-create --version` |
| 13 | `kb-create status` | Lists platform components with versions, all healthy |
| 14 | `kb-create doctor` | All checks pass (8/8 or similar), no ❌ |

### Phase 4 — Second project (isolation)

| # | Action | Expected |
|---|--------|----------|
| 15 | `cd .. && kb-create second-project --yes` | Creates successfully without touching `my-project/` |
| 16 | `cd second-project && kb --help` | Same commands available |
| 17 | Changes in `second-project/.kb/` do not affect `my-project/` | Configs are independent |

---

## Pass criteria

All steps ✅. No error output, no stack traces, no placeholder values in config.

## Notes

- Run against published binary, not `go build` dev build
- Use a real terminal after install (not the same shell — PATH won't be updated)
- If testing on CI: use Docker image with only Node + curl pre-installed
