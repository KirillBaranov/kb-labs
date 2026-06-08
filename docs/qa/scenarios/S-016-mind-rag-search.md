---
id: S-016
title: Mind — RAG search
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer uses Mind plugin to semantically search their codebase and get grounded answers.

## Prerequisites
- [ ] `mind` plugin installed (`kb marketplace install mind`)
- [ ] Codebase indexed (or indexing triggered)
- [ ] Vector store configured (qdrant or in-memory)

---

## Steps

### Phase 1 — Index

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb mind index` (or auto-index on install) | Files indexed, progress shown | | ⬜ |
| 2 | `kb mind status` | Shows indexed file count, last index time | | ⬜ |

### Phase 2 — Search

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb mind search --text "how does authentication work"` | Returns relevant code snippets with file references | | ⬜ |
| 4 | Results include file path + line number | Navigable references | | ⬜ |
| 5 | `kb mind search --text "..." --json` | Valid JSON output | | ⬜ |

### Phase 3 — Ask (grounded answer)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | `kb mind ask --text "explain the plugin system"` | Generates answer grounded in codebase | | ⬜ |
| 7 | Answer cites sources (file paths) | Not hallucinated | | ⬜ |
| 8 | `kb mind ask --agent` | Returns JSON with `answer` + `sources` | | ⬜ |

### Phase 4 — Re-index

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | Add a new file, `kb mind index` | New file appears in search results | | ⬜ |
| 10 | Delete a file, re-index | Deleted file no longer in results | | ⬜ |

---

## Result
## Bugs
## Notes
