# CLI Namespace & Naming Audit

> Working document. Goal: establish consistent naming rules and a concrete refactoring list
> before external plugin authors appear.

---

## Current Command Surface

### System commands (built into CLI, always present)

| Namespace  | Subcommands                                                    | What it actually does              |
|------------|----------------------------------------------------------------|------------------------------------|
| `auth`     | login, logout, status, register                  | Gateway authentication             |
| `platform` | sync                                                           | Platform lifecycle / provisioning  |
| `info`     | hello, version, health, diag                                   | Platform health & version info     |
| `logs`     | diagnose, context, summarize, query, search, get, stats        | Platform log access & analysis     |
| `docs`     | generate-cli-reference                                         | Generate CLI reference docs        |
| `registry` | diagnostics                                                    | Entity registry diagnostics (1 cmd)|
| `completion`| install, bash, zsh, fish                                      | Shell tab completion setup         |

### Plugin commands (optional, discovered at startup)

| Namespace         | Package                           | Subcommands (flat list)                                                                                        | Domain |
|-------------------|-----------------------------------|----------------------------------------------------------------------------------------------------------------|--------|
| `agent`           | @kb-labs/agent-entry              | run · history · diff · rollback · trace:stats/filter/iteration/context/diagnose · quality:report              | AI agents |
| `clickup`         | @kb-labs/clickup-entry            | workspace · task:search/get/create/update/delete/comment-list/comment-add · space:create/update/delete · folder:create/update/delete · list:create/update/delete/tasks/statuses | External integration |
| `commit`          | @kb-labs/commit-entry             | generate · apply · push · open · reset                                                                         | AI-powered commits |
| `devlink`         | @kb-labs/devlink-entry            | switch · status · plan · freeze · undo · backups                                                               | Cross-repo dep linking |
| `workspace`       | @kb-labs/host-agent-entry         | register · status · list                                                                                       | Remote workspace agents |
| `impact`          | @kb-labs/impact-core              | check · packages · docs                                                                                        | Change impact analysis |
| `infra-worker`    | @kb-labs/infra-worker-core        | prepare · capture-snapshot · restore-snapshot                                                                  | Environment provisioning |
| `marketplace`     | @kb-labs/marketplace-entry        | install · uninstall · update · sync · plugins:list/enable/disable/link/unlink/doctor/refresh                   | Plugin management |
| `hub`             | @kb-labs/marketplace-registry-entry | publish · share · yank · deprecate                                                                             | Plugin publishing (author tools) |
| `mind`            | @kb-labs/mind-entry               | init · verify · rag-index · rag-query · sync:add/update/delete/list/status                                    | RAG / semantic code search |
| `policy`          | @kb-labs/policy-core              | detect · check · rules · snapshot                                                                              | Policy enforcement |
| `qa`              | @kb-labs/qa-entry                 | run · check · stats · gate · history · trends · regressions · baseline:update/status/diff                     | Build/test quality metrics |
| `quality`         | @kb-labs/quality-entry            | stats · health · snapshot · history · context · gate · check-layers · coupling · build-order · cycles · dead-code · check-types · check-builds · check-tests · fix-deps · visualize | Architecture analysis |
| `release`         | @kb-labs/release-manager-cli      | plan · run · publish · rollback · report · changelog · verify · checks · build · pack · version · git         | Release pipeline |
| `review`          | @kb-labs/review-entry             | run                                                                                                            | AI code review |
| `scaffold`        | @kb-labs/scaffold                 | run · doctor                                                                                                   | Entity scaffolding |
| `workflow`        | @kb-labs/workflow-entry           | health · metrics · status · logs · list · run · job-run · runs:list/view/watch/rerun                          | Workflow engine |

---

## Problems Found

### P1 — Namespace collision: two packages under `marketplace`

`@kb-labs/marketplace-entry` and `@kb-labs/marketplace-registry-entry` both use the `marketplace`
top-level group. With namespace ownership enforcement (ADR-0018), the second package's commands
(`publish`, `share`, `yank`, `deprecate`) are silently blocked.

These are semantically different audiences too:
- `marketplace install/plugins/*` → **user** managing their plugin environment
- `marketplace publish/yank/deprecate` → **plugin author** publishing to KB Labs Hub

### P2 — `quality` vs `qa`: two plugins, blurry boundary

`qa` measures build/test health via devkit metrics (run results, baselines, gates, regressions).
`quality` does deep architecture analysis (coupling, cycles, dead-code, layer violations).

They share concepts (`gate`, `stats`, `history`) but are genuinely different domains.
Without explicit naming, users can't tell which to reach for.

### P3 — `registry` (system) occupies a confusing name

One command (`registry diagnostics`) sits under a name that every developer reads as
"plugin registry". The actual content is entity registry diagnostics — platform internals.
This is a bad tradeoff: one rarely-used internal command takes a prime namespace.

### P4 — `infra-worker`: architecture leaks into the CLI

`infra-worker` exposes the internal "worker" concept. Users care about what it does
(provision environments, capture snapshots), not how it's built. The name also
uses kebab-case at top level, inconsistent with everything else.

### P5 — kebab-case in subcommand paths

Several commands break word-boundary convention inside paths:
- `quality check-layers`, `quality fix-deps`, `quality dead-code`, `quality check-types`, `quality check-builds`, `quality check-tests`
- `infra-worker capture-snapshot`, `infra-worker restore-snapshot`
- `workflow job-run`, `workflow runs-list`, `workflow runs-view`, `workflow runs-watch`, `workflow runs-rerun`
- `clickup task comment-list`, `clickup task comment-add`
- `mind rag-index`, `mind rag-query`, `mind sync-add`, `mind sync-update`, `mind sync-delete`, `mind sync-list`, `mind sync-status`

All of these should be either proper subgroups (`quality check layers`)
or single-word verbs (`quality layers`, `quality cycles`).

### P6 — Mixed noun/verb pattern at top level

Top-level namespaces inconsistently use nouns and verbs:

| Pattern | Examples |
|---------|---------|
| Noun (domain/resource) | `marketplace`, `workflow`, `agent`, `quality`, `policy`, `mind` |
| Verb (action) | `commit`, `review`, `release`, `scaffold` |

Verb-first names like `commit` and `review` are fine as standalone commands,
but they create a naming heuristic mismatch: is `commit` the object being managed,
or the action being taken?

### P7 — `devlink`: opaque name

`devlink` means "development link" (local dependency linking). Not guessable from the name.
`kb devlink switch` — switch what? Users familiar with `npm link` / `pnpm link` might get it,
but it's not obvious.

### P8 — `mind`: opaque name

"Mind" is the internal product name for the RAG/vector-search subsystem. From a user's
perspective: `kb mind rag-query` is doubly opaque — both the namespace and the subcommand
expose internal terminology. Users want "search my codebase".

### P9 — `workspace` shares top level with host-agent internals

`host-agent` registers both `workspace /*` and `agent /*` (register, status) — the `agent`
subpath overlaps with the `agent` plugin's namespace. Currently works because they're different
subcommands, but fragile.

### P10 — `impact`: understated name for what it does

`impact check` analyzes which packages/docs are affected by current changes. "Impact" is
accurate but abstract. In the context of a PR or CI check, users think "what's changed"
not "what's the impact".

---

## Proposed Naming Rules

These rules emerged from the audit above. Proposed as a consistent convention for all
current and future CLI namespaces.

### Rule 1 — Top-level is always a noun (domain / resource)

The top level names a **domain** the user is working in, not an action.

```
✓  agent      (the AI agent system)
✓  workflow   (workflows)
✓  marketplace (plugin store)
✗  commit     (is this the object or the verb?)
✗  review     (verb or noun?)
```

Standalone action-heavy commands (`commit`, `review`) are acceptable exceptions
if the domain IS the verb concept — but they should be documented as exceptions,
not a pattern.

### Rule 2 — Second level is a verb from a standard vocabulary

No invented verbs. Standard set:

| Category  | Allowed verbs                           |
|-----------|-----------------------------------------|
| Data      | `list`, `get`, `create`, `update`, `delete` |
| Lifecycle | `run`, `start`, `stop`, `apply`, `sync` |
| Publishing| `publish`, `yank`, `deprecate`, `share` |
| Info      | `status`, `health`, `logs`, `diag`      |
| Setup     | `init`, `install`, `uninstall`, `link`, `unlink` |

### Rule 3 — No kebab-case in command paths

Use subgroups instead:
```
✗  quality check-layers
✓  quality check layers     (3-part path)

✗  workflow runs-list
✓  workflow runs list

✗  mind rag-query
✓  mind search              (rename to something clear)
```

### Rule 4 — No implementation details in names

```
✗  infra-worker    (internal architecture)
✗  mind rag-query  (RAG is internal term)
✓  infra           or  env  or  provision
✓  mind search     or  search
```

### Rule 5 — One package = one top-level namespace (ADR-0018)

Already enforced. Documented here for plugin authors.

### Rule 6 — Reserved platform namespaces are explicit

The following top-level names are reserved by the platform and cannot be used by plugins:

```ts
// cli/commands/src/registry/service.ts
const RESERVED_NAMESPACES = new Set([
  // Platform internals
  '__complete', '__internal',
  // System command groups (registered at startup, always present)
  'auth', 'platform', 'info', 'logs', 'docs', 'registry', 'completion',
]);
```

---

## Refactoring Candidates

Ordered by impact and effort.

### 🔴 Must fix (broken today)

| # | What | Problem | Proposed fix |
|---|------|---------|--------------|
| R1 | `marketplace-registry-entry` blocked | P1: namespace collision | ✅ Fixed — moved to `hub` top-level group |
| R2 | `infra-worker` kebab at top level | P4 + P5 | Rename namespace |

### 🟡 Should fix (confusing for users and future authors)

| # | What | Problem | Proposed fix |
|---|------|---------|--------------|
| R3 | `registry` (system) | P3: prime name for 1 internal cmd | Move under `info diag` or `platform diag` |
| R4 | `quality` kebab subcommands | P5 | Restructure as proper subgroups |
| R5 | `workflow` kebab subcommands (`runs-list` etc.) | P5 | `workflow runs list/view/watch/rerun` |
| R6 | `mind` subcommand names (`rag-index`, `rag-query`, `sync-add`) | P5 + P8 | `mind index`, `mind search`, `mind sync add` |
| R7 | `clickup` kebab (`comment-list`, `comment-add`) | P5 | `clickup task comments list/add` |
| R8 | `quality` vs `qa` boundary | P2 | Document the boundary explicitly (or merge) |

### 🟢 Nice to have (polish)

| # | What | Problem | Proposed fix |
|---|------|---------|--------------|
| R9  | `devlink` opaque name | P7 | Consider `deps` or `link` |
| R10 | `mind` opaque name | P8 | Consider `search` or `rag` |
| R11 | `impact` understated | P10 | Consider `diff` or `affected` |
| R12 | `infra-worker` subcommand names (`capture-snapshot`) | P5 | `infra snapshot capture/restore` |

---

## Open Questions

**Q1: Where do `marketplace-registry` commands go?**
Options discussed:
- `hub publish`, `hub yank` — "KB Labs Hub" for authors
- `publish plugin`, `publish yank` — verb-first group for publishing actions
- Keep under `marketplace` via explicit namespace sharing (requires Rule 5 exception mechanism)

**Q2: Merge `quality` and `qa`, or keep separate with clear docs?**
`qa` = devkit-based build/test metrics (CI-friendly)
`quality` = architecture analysis (ad-hoc / dev-time)
These could be subgroups of a single `quality` namespace if ownership is resolved.

**Q3: Should `commit`, `review`, `release`, `scaffold` stay verb-first?**
They're natural language commands developers would type. The counter-argument is
consistency with Rule 1. No right answer — needs a decision.

**Q4: `workspace` from host-agent — is this the right name?**
"Workspace" = a connected remote machine running the workspace agent.
`kb workspace register`, `kb workspace list` — fine. But it could conflict with
any future "workspace management" concept (like a monorepo workspace).
