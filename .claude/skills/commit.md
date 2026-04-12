---
name: commit
description: Create a conventional commit. Scope required in 99% of cases — use the package name (drives changelog generation).
---

# Conventional Commit

Format:
```
<type>(<scope>): <short message>

<optional body — what changed and why, not how>
```

## Rules

**Scope is required** in 99% of cases. Use the **package name** (without `@kb-labs/` prefix) — this is what drives changelog generation.

Examples of valid scopes: `sdk`, `core-types`, `gateway`, `release`, `state`, `workflow`, `rest-api`, `cli`, `marketplace`

Omit scope only when a change is truly cross-cutting with no single owner (e.g. root `pnpm-workspace.yaml`).

## Types

| Type | Use when |
|------|----------|
| `feat` | New capability visible to users or plugin authors |
| `fix` | Bug fix |
| `chore` | Maintenance: deps, build scripts, CI, release bookkeeping |
| `refactor` | Code restructured, no behavior change |
| `perf` | Performance improvement |
| `test` | Tests only |
| `docs` | Documentation only |

## Process

1. Run `git diff --staged` to see what's staged. If nothing is staged, check `git status` and stage the relevant files.
2. Determine the scope from the affected package directory (`plugins/X`, `sdk/X`, `core/X`, etc.).
3. Write a short imperative subject line (≤72 chars). No period at the end.
4. If the change needs context (why it was done, what was broken), add a body after a blank line.
5. Commit. Never `--no-verify`. Never amend published commits.

## Examples

```
feat(sdk): add streaming support to agent executor

Consumers can now pass onChunk callback to receive partial output
before the full result is available.
```

```
fix(gateway): reject requests with expired JWT before routing
```

```
chore(release): bump @kb-labs/sdk to 1.7.0
```

```
refactor(core-runtime): extract provisionEnvironment into isolated-backend
```

## Breaking Changes

Append `!` after type/scope and add `BREAKING CHANGE:` footer:

```
feat(sdk)!: remove legacy runAgent() API

BREAKING CHANGE: runAgent() is removed. Use agent.execute() instead.
```

## Instructions

When the user invokes `/commit`:
1. Read `git diff --staged`. If empty, read `git status` and ask the user which files to stage, or stage obviously related files.
2. Infer type, scope, and message. Show the proposed commit message to the user for confirmation before committing.
3. After confirmation, run `git commit -m "..."` using a heredoc to preserve formatting.
4. Report the commit hash.
