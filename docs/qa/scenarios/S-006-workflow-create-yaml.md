---
id: S-006
title: Workflow — Create from YAML
persona: solo-developer
priority: P0
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/basic.spec.ts
---

## Goal
Developer writes a workflow YAML file, KB Labs discovers it, and it appears in the workflow list ready to run.

## Prerequisites
- [ ] Platform installed, `kb-dev start` done
- [ ] Services healthy (gateway :4000, workflow :7778)

---

## Steps

### Phase 1 — Write workflow

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Create `.kb/workflows/hello.yaml` with minimal workflow definition | File created | | ⬜ |
| 2 | `curl http://localhost:7778/api/v1/workflows` | `hello` appears in list | | ⬜ |
| 3 | `kb workflow list` | Shows `hello` workflow | | ⬜ |

### Phase 2 — Workflow structure validation

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Workflow has `id`, `name`, at least one `job` | Parsed correctly, no errors in logs | | ⬜ |
| 5 | Write workflow with syntax error (missing required field) | Error surfaced clearly — not silent fail | | ⬜ |

### Phase 3 — Hot reload

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Edit `.kb/workflows/hello.yaml` while services running | Change picked up without restart | | ⬜ |
| 7 | `kb workflow list` after edit | Shows updated definition | | ⬜ |

---

## Result
## Bugs
## Notes
