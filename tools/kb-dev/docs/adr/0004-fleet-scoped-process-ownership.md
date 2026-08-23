# ADR 0004: Fleet-scoped process ownership

## Status

Accepted

## Context

Several worktrees may run the same platform on one host. A PID directory tied
to the current working directory is useful for normal lifecycle operations, but
it cannot explain a process started from another worktree, a stale PID file, or
an orphan left after a failed health check.

## Decision

`kb-dev` keeps the current directory as the default project scope and adds an
explicit project selector for cross-worktree operations. Fleet inspection is
opt-in with `--all`. A runtime ownership record includes project ID/root,
service ID, instance ID, PID/PGID, process start identity, and net offset.

The runtime catalog is an index, not authority. A process is considered owned
only when its PID, start identity, process group, and ownership metadata agree.
PID files are reconciled as stale when the process is gone, a zombie, or the
start identity no longer matches. Live processes without a matching record are
reported as orphaned and are never killed implicitly.

## Scope

The initial fleet commands are `status --all`, `--project <alias|path>` for
lifecycle and logs, and project-scoped log paths. `switch` remains the explicit
resource-saving policy: it may stop other registered projects, while ordinary
start/stop/status commands do not change other project state.

## Consequences

- Agents can inspect and control a project from any CWD without parsing `ps`.
- A failed start cannot leave its process group as an untracked retrying clone.
- A missing project directory or registry entry does not authorize killing a
  live process; cleanup remains explicit.
- Docker services record the inspected container ID when a configured container
  becomes available and use the configured stop command (or container name as a
  fallback) during failed-start cleanup. Docker labels remain optional; an
  unlabeled container is never treated as owned solely because its name matches.
