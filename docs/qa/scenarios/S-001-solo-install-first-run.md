---
id: S-001
title: Solo — Install & First Run
persona: solo-developer
priority: P0
automation: e2e-done
e2e: e2e/install-flow/test.sh
---

## Goal

A developer installs KB Labs from scratch on a clean machine, bootstraps a project,
verifies all tools are available, and runs a basic AI command — all without any
prior KB Labs knowledge.

## Prerequisites

- [ ] Clean machine or isolated directory (no existing KB Labs install)
- [ ] Node.js 20+ installed
- [ ] Internet access (install script + npm registry)
- [ ] No `kb-create`, `kb-dev`, `kb` in PATH

> **Note:** For honest QA against current sources — build kb-create from source
> (`cd tools/kb-create && go build -o /tmp/kb-create-local .`) and publish monorepo
> packages to local Verdaccio (`e2e/scripts/pack-all.sh` + publish script).
> Use `--platform /tmp/qa-platform` to force a fresh platform install.

---

## Steps

### Phase 1 — Install

| # | Action | Expected | Actual (2.94.0, 2026-06-05) | Status |
|---|--------|----------|-----------------------------|--------|
| 1 | `curl -fsSL https://kblabs.ru/install.sh \| sh` | `kb-create` in PATH | Tested via Docker e2e only | ⬜ |
| 2 | `kb-create --version` | Prints version | `dev` (source build) | ✅ |

### Phase 2 — Bootstrap project

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb-create my-project --yes --llm` | Project created, no `@kb-labs/*` peer-dep errors. No `loadOverlays` import warnings. | Created OK. `unmet peer zod@>=4.1.5: found 3.25.76`. Gateway registration 401 → LLM skipped | ⚠️ |
| 4 | `cat my-project/.env` | `KB_GATEWAY_CLIENT_ID` + `KB_GATEWAY_CLIENT_SECRET` | File not created — gateway registration 401 | ❌ |
| 5 | `.env` in `.gitignore` | Listed | Present | ✅ |
| 6 | `kb-create nollm-project --yes` | No credentials in `.env` | No `.env` created | ✅ |

### Phase 3 — Verify installation

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `kb-create status` | 5+ components, correct project path | 8 core packages + 5 services + plugins. Project path correct with fresh `--platform` dir | ✅ |
| 8 | `kb-dev --version` | Prints version | `2.93.4-binaries` | ✅ |
| 9 | `kb-create doctor` | 7+/8 passed | 8/8 passed | ✅ |
| 10 | `kb --help` | Shows `commit`, `scaffold` | Both visible via binary. Dev alias `pnpm kb` overrides binary (dev-only issue) | ✅ user / ❌ dev |

### Phase 4 — AI commit

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 11 | Gateway token endpoint reachable | HTTP 200 with valid creds | 401 with invalid creds — endpoint is up | ✅ |
| 12 | Gateway LLM endpoint | HTTP 200 | Not tested — no credentials | ⬜ |
| 13 | `kb commit commit --dry-run` | `LLM: Phase` in output | `[commit] LLM failed, falling back to heuristics: 401 "Unauthorized"` — graceful fallback, exit 0. Heuristic generates commit message. | ⚠️ |
| 14 | `kb commit commit --yes` | Creates AI commit | Creates heuristic commit (not AI). Exit 0. | ⚠️ |

### Phase 5 — Plugin scaffold & run

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 15 | `kb scaffold run plugin demo --yes` | Plugin dir at `.kb/plugins/demo/` | Created successfully. Registered in `marketplace.lock`. | ✅ |
| 16 | `pnpm install && pnpm build` in plugin dir | Build succeeds, `dist/manifest.js` exists | Both succeed. manifest.js exists. | ✅ |
| 17 | Manifest contains plugin definition | `definePlugin` or `pluginName` | Manifest has valid `schema: kb.plugin/3`, commands, permissions | ✅ |
| 18 | `kb demo hello --who=World` | `Hello, World from demo` | ❌ `Unknown command: demo hello`. Manifest fails validation: `[0].segments: Array must contain at least 1 element(s)`. Scaffold template doesn't generate `segments` field. | ❌ |

### Phase 6 — Update platform

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 19 | `kb-create update --yes` | Completes, `marketplace.lock` present | Not run — blocked by B-001 (no credentials) | ⬜ |
| 20 | `kb --help` after update | Plugins still visible | Not tested | ⬜ |
| 21 | Credentials survive update | `.env` intact | Not applicable — never created | ⬜ |
| 22 | `kb commit commit --dry-run` after update | LLM path | Not tested | ⬜ |

---

## Result

**PARTIAL** — Core install works, services healthy, scaffold works and builds. Blocked by B-001 (no LLM credentials) and B-013 (scaffold manifest fails validation).

## Bugs

| ID | Step | Priority | Description |
|---|---|---|---|
| B-001 | 3,4 | **P0** | `--llm` bootstrap: gateway registration 401 → `.env` not written |
| B-013 | 18 | **P0** | Scaffold template generates manifest without `segments` field on commands → `MANIFEST_VALIDATION_FAILED`, plugin unusable |
| B-003 | 10 | P1 dev | `kb` alias `pnpm --silent kb` overrides binary in dev env |
| B-007 | 3 | P2 | `unmet peer zod@>=4.1.5: found 3.25.76` in pnpm output |

> **Resolved on 2.94.0:** B-004 (stack trace on bad creds — now graceful fallback), B-005 (scaffold exits 0 but creates nothing — now creates correctly)

## Notes

- Run date: 2026-06-05. Source: `2.94.0` (built from monorepo). macOS Darwin 24.5.0 / Node 20.19.4.
- Fresh `--platform /tmp/qa-platform` required to avoid stale installed packages.
- `loadOverlays` crash only occurs when old platform dir is reused (stale `core-config`). Fresh install is clean.
