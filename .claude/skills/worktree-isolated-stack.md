---
name: worktree-isolated-stack
description: Run a KB Labs backend and Studio stack from an isolated worktree without colliding with another local stack.
globs:
  - ".claude/worktrees/**"
  - ".kb/devservices*.yaml"
  - "scripts/lib/ports.mjs"
  - "infra/port-registry.yaml"
---

# Isolated worktree stack

Use this workflow when the current checkout is a Git worktree or another KB Labs stack may already be running.

## Start safely

1. Build the affected workspace first:

```bash
kb-devkit run build --affected
```

2. Pick a non-zero network offset not used by another active worktree. Do not edit service ports.

3. Start services with the worktree's runtime config and the same offset on every start or restart:

```bash
kb-dev start --config .kb/devservices.dev.yaml --net-offset <N>
kb-dev status --config .kb/devservices.dev.yaml
kb-dev logs <service> --config .kb/devservices.dev.yaml
```

The base stack can use `.kb/devservices.yaml` instead. These files are machine-local; if neither exists, complete the local KB Labs setup rather than inventing a config.

## Rules

- `--config` and `--net-offset` are mandatory for `start`, `restart`, and `ensure` in this repository.
- Keep the selected offset consistent for the worktree. Mixing offsets creates an incoherent stack.
- If a port is busy, inspect running projects/services and choose another offset; never change `devservices*.yaml` port assignments.
- Stop only the stack belonging to the current worktree before changing offsets or removing its runtime state.
- Use `kb-dev status --json` and `kb-dev health` to verify the intended instance, not merely that some localhost port responds.
