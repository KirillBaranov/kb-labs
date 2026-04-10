# ADR-0001: Monorepo Consolidation

**Date:** 2026-04-10
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-10
**Reviewers:** —
**Tags:** architecture, monorepo, dependencies, workspace

## Context

KB Labs grew from a single CLI tool into a platform of 141 packages across 22 git submodules managed by a root workspace (`kb-labs-workspace`). Each submodule was an independent git repository with its own versioning, lockfile, and release cycle.

To make cross-repo development work, we built:

- **DevLink plugin** — 11-step pipeline to switch 204 `link:` dependencies between local paths and npm versions, with backup/restore, workspace.yaml sync, and lockfile cleanup
- **Submodule sync scripts** — detecting and registering new submodules in `.gitmodules`
- **Per-repo pnpm-workspace.yaml generation** — so sub-repos could resolve cross-repo dependencies autonomously

### Problems

1. **Fragile `link:` paths** — 204 relative paths across 100+ package.json files. Any directory restructuring breaks them. DevLink recalculates, but the switch process takes 10-15 minutes and can leave the workspace in an inconsistent state if install fails mid-way.
2. **22 lockfiles** — each submodule has its own `pnpm-lock.yaml` with hardcoded absolute paths. After a mode switch, all lockfiles must be deleted and regenerated from scratch.
3. **Bootstrap paradox** — DevLink is a platform plugin. To fix dependencies, you need a working platform. But the platform depends on those dependencies being correct.
4. **Cognitive overhead** — contributors must understand git submodules, DevLink modes, `link:` vs `workspace:*` vs `^version` semantics, and the switch process before they can work on the codebase.
5. **Unnecessary isolation** — submodules provide git-level boundaries (separate history, access control, release cycles). With a single developer, none of these boundaries provide value. They only add cost.
6. **No atomic cross-cutting changes** — changing a core type requires commits in multiple repos, coordinated PRs, and careful publish ordering.

### Industry precedent

Large-scale monorepos are the industry standard for multi-package projects:

| Project | Contributors | Repo | Packages |
|---------|-------------|------|----------|
| Next.js | 3,000+ | 1 | ~20 |
| Babel | 800+ | 1 | 200+ |
| Angular | 1,800+ | 1 | ~30 |
| Grafana | 3,000+ | 1 | hundreds |
| Vue | 500+ | 1 | ~30 |

Google operates a single repository with 2 billion lines of code. The tooling differs (Bazel, Piper, CitC), but the principle holds: **one dependency graph, one source of truth**.

## Decision

Consolidate all 22 git submodules into a single public monorepo (`kb-labs` on GitHub). Use `workspace:*` for all internal dependencies. Use [changesets](https://github.com/changesets/changesets) for independent npm versioning and publishing.

### Repository

- **Primary repo:** `github.com/KirillBaranov/kb-labs` (currently public/docs — repurposed)
- **Old repos:** archived on GitHub (read-only, history preserved)
- **Migration approach:** clean start (copy files, not history merge)

### Directory structure

```
kb-labs/
│
├── core/                        # Foundation — zero external deps within platform
│   ├── types/                   # @kb-labs/core-types
│   ├── contracts/               # @kb-labs/core-contracts
│   ├── sys/                     # @kb-labs/core-sys
│   ├── config/                  # @kb-labs/core-config
│   ├── workspace/               # @kb-labs/core-workspace
│   ├── platform/                # @kb-labs/core-platform
│   ├── runtime/                 # @kb-labs/core-runtime
│   ├── discovery/               # @kb-labs/core-discovery
│   ├── registry/                # @kb-labs/core-registry
│   ├── state-broker/            # @kb-labs/core-state-broker
│   ├── resource-broker/         # @kb-labs/core-resource-broker
│   ├── tenant/                  # @kb-labs/core-tenant
│   ├── policy/                  # @kb-labs/core-policy
│   ├── sandbox/                 # @kb-labs/core-sandbox
│   ├── ipc/                     # @kb-labs/core-ipc
│   ├── bundle/                  # @kb-labs/core-bundle
│   ├── llm-router/              # @kb-labs/llm-router
│   └── telemetry-client/        # @kb-labs/telemetry-client
│
├── sdk/                         # Public API for plugin authors
│   ├── sdk/                     # @kb-labs/sdk
│   └── platform-client/         # @kb-labs/platform-client
│
├── cli/                         # CLI framework
│   ├── bin/                     # @kb-labs/cli-bin
│   ├── commands/                # @kb-labs/cli-commands
│   ├── runtime/                 # @kb-labs/cli-runtime
│   └── contracts/               # @kb-labs/cli-contracts
│
├── shared/                      # Cross-cutting utilities
│   ├── cli-ui/                  # @kb-labs/shared-cli-ui
│   ├── command-kit/             # @kb-labs/shared-command-kit
│   ├── http/                    # @kb-labs/shared-http
│   ├── testing/                 # @kb-labs/shared-testing
│   ├── tool-kit/                # @kb-labs/shared-tool-kit
│   └── perm-presets/            # @kb-labs/perm-presets
│
├── plugins/                     # All optional functionality (duck typing rule)
│   │
│   │  ## AI & Search
│   ├── mind/                    # RAG, embeddings, vector search (10 packages)
│   ├── agents/                  # Autonomous agents, MCP (8 packages)
│   ├── commit/                  # AI-powered commits (4 packages)
│   ├── review/                  # AI code review (5 packages)
│   │
│   │  ## Orchestration
│   ├── workflow/                # Workflow engine + daemon :7778 (8 packages)
│   │
│   │  ## Infrastructure services
│   ├── gateway/                 # API gateway :4000 (4 packages)
│   ├── rest-api/                # Main platform API :5050 (2 packages)
│   ├── state/                   # State daemon :7777
│   ├── marketplace/             # Entity marketplace :5070 (5 packages)
│   ├── host-agent/              # Remote workspace agent (6 packages)
│   │
│   │  ## DevOps & Quality
│   ├── release/                 # Release manager (5 packages)
│   ├── quality/                 # Monorepo health (3 packages)
│   ├── qa/                      # QA system (3 packages)
│   ├── impact/                  # Impact analysis
│   ├── policy/                  # Policy enforcement
│   ├── infra-worker/            # Infra tasks
│   └── devlink/                 # Cross-repo deps (legacy, for external users)
│
├── adapters/                    # Interface implementations
│   ├── analytics-duckdb/        # @kb-labs/adapters-analytics-duckdb
│   ├── analytics-sqlite/        # @kb-labs/adapters-analytics-sqlite
│   ├── analytics-file/          # @kb-labs/adapters-analytics-file
│   ├── logging-pino/            # @kb-labs/adapters-logging-pino
│   ├── logging-sqlite/          # @kb-labs/adapters-logging-sqlite
│   ├── logging-ring-buffer/     # @kb-labs/adapters-logging-ring-buffer
│   ├── cache-redis/             # @kb-labs/adapters-cache-redis
│   ├── storage-mongodb/         # @kb-labs/adapters-storage-mongodb
│   ├── storage-qdrant/          # @kb-labs/adapters-storage-qdrant
│   ├── llm-openai/              # @kb-labs/adapters-llm-openai
│   ├── llm-vibe-proxy/          # @kb-labs/adapters-llm-vibe-proxy
│   ├── environment-docker/      # @kb-labs/adapters-environment-docker
│   ├── workspace-localfs/       # @kb-labs/adapters-workspace-localfs
│   ├── workspace-worktree/      # @kb-labs/adapters-workspace-worktree
│   ├── workspace-agent/         # @kb-labs/adapters-workspace-agent
│   └── openai-proxy/            # @kb-labs/openai-proxy
│
├── infra/                       # Build tooling & plugin system
│   ├── devkit/                  # @kb-labs/devkit — tsconfig, eslint configs
│   └── plugin-system/           # Plugin framework
│       ├── manifest/            # @kb-labs/plugin-manifest
│       ├── runtime/             # @kb-labs/plugin-runtime
│       ├── execution/           # @kb-labs/plugin-execution
│       └── execution-factory/   # @kb-labs/plugin-execution-factory
│
├── studio/                      # Web UI
│   ├── app/                     # Studio SPA (:3000)
│   ├── ui-kit/                  # @kb-labs/studio-ui-kit
│   ├── ui-core/                 # @kb-labs/studio-ui-core
│   ├── hooks/                   # @kb-labs/studio-hooks
│   ├── data-client/             # @kb-labs/studio-data-client
│   ├── event-bus/               # @kb-labs/studio-event-bus
│   ├── federation/              # @kb-labs/studio-federation
│   └── plugin-tools/            # @kb-labs/studio-plugin-tools
│
├── tools/                       # Go binaries
│   ├── kb-devkit/               # Build/lint/test orchestrator
│   ├── kb-dev/                  # Service manager
│   └── kb-create/               # Installer
│
├── sites/                       # Public websites
│   └── kb-labs-web/             # Product site
│
├── templates/                   # Starter templates
│   ├── plugin-template/
│   └── product-template/
│
├── _private/                    # .gitignored — local-only
│   ├── claw-code/               # Research/experiments
│   └── kirill-baranov-web/      # Personal site
│
├── docs/                        # Documentation
│   ├── adr/                     # Architecture Decision Records
│   └── plans/
│
├── devkit.yaml                  # Task runner config
├── pnpm-workspace.yaml          # Single workspace definition
├── .changeset/                  # Independent versioning config
├── .gitignore                   # Includes _private/
└── CLAUDE.md
```

### Dependency flow

```
Layer 0:  core/
Layer 1:  sdk/  shared/  infra/plugin-system/
Layer 2:  cli/  adapters/
Layer 3:  plugins/ (consume sdk, may consume adapters)
Layer 4:  studio/ (consumes sdk, plugins expose pages)
```

Dependencies flow strictly downward. No package in a lower layer may depend on a higher layer.

### Plugin classification (duck typing rule)

A package group is a **plugin** if it:
- Uses the SDK (`@kb-labs/sdk`)
- Registers CLI commands and/or Studio pages
- Has a plugin manifest

Whether it also runs an HTTP daemon is an **implementation detail**, not an architectural boundary. Plugins with daemons declare `"requires": ["gateway"]` in their manifest.

### Installation levels

```
Level 1: CLI-only (minimum)
  core + sdk + cli + CLI-only plugins
  No HTTP, no ports, no services

Level 2: +Gateway (HTTP foundation)
  + gateway plugin (:4000)
  Required for any daemon plugin

Level 3: +Services (pick what you need)
  + workflow (:7778)
  + marketplace (:5070)
  + rest-api (:5050)
  + state (:7777)
  All routed through gateway
```

### Versioning and publishing

- **Internal dependencies:** `workspace:*` everywhere — resolved by pnpm at install time
- **Publishing:** `workspace:*` is automatically replaced with `^x.y.z` by pnpm during `pnpm publish`
- **Independent versions:** managed by [changesets](https://github.com/changesets/changesets) — each package has its own semver, own changelog, published independently
- **No mode switching:** there is only one mode — `workspace:*`

### Private/commercial code

The monorepo is **fully public (OSS)**. Future commercial code (SaaS billing, enterprise plugins) will live in a separate private repository (`kb-labs-enterprise`) that depends on the public packages via npm versions. This follows the GitLab/Grafana/Sentry model.

## Consequences

### Positive

- **204 `link:` paths eliminated** — replaced by `workspace:*` (zero maintenance)
- **22 lockfiles → 1** — single source of truth for dependency resolution
- **DevLink eliminated** — no more switch pipeline, backup/restore, workspace.yaml sync
- **Submodule sync eliminated** — no `.gitmodules`, no `pnpm sync:submodules`
- **Atomic cross-cutting changes** — one commit, one PR for changes spanning multiple packages
- **Simplified onboarding** — `git clone` + `pnpm install` (no submodule init, no DevLink)
- **Changesets for independent publishing** — automated version bumps and changelogs
- **`kb-devkit run --affected` still works** — build only what changed (git diff, not submodule diff)

### Negative

- **Larger git clone** — ~230K lines in one repo (negligible for git)
- **Noisier git log** — all packages share one history (mitigated by `git log -- path/`)
- **No per-directory access control** — GitHub doesn't support this (mitigated by CODEOWNERS)
- **Migration effort** — one-time cost to restructure and verify builds

### Alternatives Considered

1. **Keep submodules + harden DevLink** — rejected because it treats symptoms (fragile switch) rather than the root cause (unnecessary repo boundaries). The bootstrap paradox remains unsolvable within this model.

2. **Move DevLink logic to kb-devkit-bin (Go)** — removes the bootstrap paradox but still requires maintaining 204 `link:` paths and the switch pipeline. The fundamental complexity remains.

3. **Federated repos with npm-only deps** — each repo fully autonomous, dependencies only through npm registry. Rejected because the feedback loop is too slow for a solo developer: change core type → publish → wait → update consumer → repeat.

4. **pnpm workspace across submodules** — `workspace:*` can technically work if the root `pnpm-workspace.yaml` includes all submodule paths. However, `workspace:*` is replaced with `^version` during `pnpm publish`, and when publishing from within a submodule, pnpm doesn't see the root workspace — so the version resolution fails. Submodules and `workspace:*` are fundamentally incompatible for publishing.

## Implementation

### Migration plan

1. **Prepare `kb-labs` repo** — clear current docs-only content
2. **Create directory structure** — as defined above
3. **Copy packages** — from workspace submodules into new locations (files only, no `.git`)
4. **Replace all `link:` with `workspace:*`** — in every package.json
5. **Create single `pnpm-workspace.yaml`** — covering all package paths
6. **Add `_private/` to `.gitignore`**
7. **`pnpm install`** — verify single lockfile resolves everything
8. **Update `devkit.yaml`** — new category glob patterns
9. **`kb-devkit run build`** — verify full build passes
10. **Install changesets** — `pnpm add -Dw @changesets/cli`
11. **Update CLAUDE.md** — remove submodule/DevLink references
12. **Initial commit + push**
13. **Archive old repos** — after 1 week verification period

### What becomes obsolete

| Component | Reason |
|-----------|--------|
| DevLink plugin (`plugins/devlink/`) | No cross-repo deps to switch. Keep for external npm users only. |
| `scripts/devkit-sync.mjs` | No submodules to sync assets to |
| `.gitmodules` | No submodules |
| `pnpm sync:submodules` scripts | No submodules |
| Per-subrepo `pnpm-workspace.yaml` | Single root workspace |
| `kb-labs-workspace` repo | Replaced by `kb-labs` |
| 22 individual GitHub repos | Archived (read-only) |

### Revisit triggers

- If the team grows beyond ~5 active contributors working on unrelated areas, consider CODEOWNERS + branch protection per directory
- If commercial code needs strict isolation, create `kb-labs-enterprise` repo (GitLab model)
- If git clone time becomes noticeable (>1 min), evaluate `git sparse-checkout`

## References

- [Google monorepo paper](https://research.google/pubs/pub45424/) — "Why Google Stores Billions of Lines of Code in a Single Repository"
- [Changesets documentation](https://github.com/changesets/changesets)
- [pnpm workspace protocol](https://pnpm.io/workspaces#workspace-protocol-workspace) — `workspace:*` semantics
- Internal: DevLink plugin source (`plugins/kb-labs-devlink/`)
- Internal: Submodule sync script (`scripts/devkit-sync.mjs`)

---

**Last Updated:** 2026-04-10
**Next Review:** After migration is complete
