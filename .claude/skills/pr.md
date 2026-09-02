---
name: pr
description: Open or update a GitHub PR with the workspace's standard title and description structure. Draft the description from the diff, then create/update via gh.
---

# Pull Request description

Structure enforced by [pr-description-lint.yml](../../.github/workflows/pr-description-lint.yml) (blocking check) and documented in [PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md).

## Title

```
<type>(<scope>): <short message> [TASK-ID]
```

- `type`/`scope` — same as [commit.md](commit.md): `feat`, `fix`, `chore`, `refactor`, `perf`, `test`, `docs`.
- The message must say what the PR actually does — CI rejects generic messages (`wip`, `fix`, `update`, `misc`, etc.) and titles with no type prefix.
- `[TASK-ID]` (e.g. a ClickUp task ID via [clickup.md](clickup.md)) is a recommendation, not required — add it when the PR tracks a specific task.

## Body

```
## What

<what you actually changed>

## Why

<the problem this solves, or what it enables>

## How verified

<tests run, manual steps taken, what you checked>

## Plan / Reference

<link to the plan, ticket, or design doc this PR follows, if any>

## Checklist

- [ ] pnpm check:affected passes (build + lint + types + tests)
- [ ] New/changed types are in `contracts/` (not in `core/`)
- [ ] No `link:` dependencies (use `workspace:*`)
- [ ] ADR added if this is an architectural change
```

CI checks that `What`, `Why`, and `How verified` have real content — not just the template's HTML-comment placeholder left in place. `Plan / Reference` may stay empty; leave the placeholder if there's genuinely nothing to link.

## Process

When asked to open a PR, or to draft/update a PR description:

1. Find the base branch and diff: `git status`, `git log <base>..HEAD --oneline`, `git diff <base>...HEAD --stat`.
2. Draft the title and each body section from the actual diff and commit history — don't invent a "Why" that isn't supported by the commits. If the motivation isn't obvious from the code, ask.
3. Show the drafted title + body to the user before creating or editing the PR — they may want to adjust wording, add a task tag, or fill in `Plan / Reference` themselves.
4. Create or update:
   ```bash
   gh pr create --title "<title>" --body "$(cat <<'EOF'
   <body>
   EOF
   )"
   ```
   or `gh pr edit <number> --title "..." --body "..."` for an existing PR.
5. If `pr-description-lint` was already failing on an open PR, re-check with `gh pr view <number> --json title,body` after editing to confirm the sections now have real content.
