# ADR-0002: PID-First Process Tracking

**Date:** 2026-03-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-30
**Tags:** [process-management, reliability]

## Context

`dev.sh` uses port-based liveness detection:

```
is_port_occupied(port) → lsof -ti :PORT
is_health_ok(service)  → curl healthCheck URL
state = port occupied + health ok → "alive"
```

This fails when:
- An alien process occupies the port (Chrome, unrelated dev server)
- The healthCheck is not configured (assumes healthy)
- The process crashes but the port is reused by OS

The root problem: **dev.sh doesn't know which process it started.** It guesses by checking what's on the port.

## Decision

**PID-first, port-second.** kb-dev tracks processes by PID from the moment of spawn:

```
1. Spawn → cmd.Process.Pid → known immediately
2. PID alive? → syscall.Kill(pid, 0)
3. Health OK? → HTTP/TCP/Command probe
4. Both true → alive
5. PID alive, health fail → degraded
6. PID dead → dead (regardless of port)
```

Port checks (`lsof`) are used only for:
- `--force` flag: find and kill alien processes before starting
- `doctor` command: detect port conflicts diagnostically

### Rich PID Files

PID files contain JSON metadata:

```json
{
  "pid": 12345,
  "pgid": 12345,
  "user": "kirill",
  "command": "node ./platform/.../dist/bin.cjs",
  "service": "state-daemon",
  "startedAt": "2026-03-30T14:30:00Z"
}
```

This enables:
- `status` shows who started a service and when
- `stop` can warn about stopping another user's service
- `reconcile` cleans stale PID files from crashed kb-dev instances
- Legacy bare-number PID files (from dev.sh) are parsed gracefully

### Process Groups

Every spawned process gets `SysProcAttr{Setpgid: true}`:

```go
cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
cmd.Start()
pgid, _ := syscall.Getpgid(cmd.Process.Pid)
```

Kill is one syscall: `syscall.Kill(-pgid, SIGTERM)`. This catches the entire process tree — bash, node, pnpm, vite, esbuild, all children.

### Exec Prefix for Simple Commands

Simple commands (no `&&`, `|`, `;`) get `exec` prepended:

```bash
# Config: "node ./dist/bin.cjs"
# Executed as: bash -c "exec node ./dist/bin.cjs"
```

`exec` replaces the bash wrapper with the real process, so `cmd.Process.Pid` points to `node`, not `bash`. For compound commands, bash stays as the process group leader.

## Consequences

### Positive

- No false positives from alien processes on ports
- Reliable kill of entire process tree in one syscall
- Rich metadata enables multi-user awareness
- Backward compatible with legacy dev.sh PID files
- `reconcile` on startup cleans stale state automatically

### Negative

- If kb-dev is killed with `SIGKILL` (not `SIGTERM`), PID files become stale — fixed by reconcile on next run
- Compound commands (`cd X && pnpm dev`) show bash PID, not the final process — mitigated by process group kill

### Alternatives Considered

- **Port-based detection (current dev.sh)** — Unreliable, causes false positives
- **Container-based isolation** — Overkill for local dev, slow iteration cycle
- **systemd-style socket activation** — Platform-specific, complex, not cross-platform

## Implementation

- `internal/process/spawn.go` — Spawn with Setpgid, exec prefix
- `internal/process/kill.go` — Group kill, port kill (for --force)
- `internal/process/pid.go` — Rich PID read/write/reconcile
- `internal/manager/manager.go` — Reconcile() on startup

## References

- [ADR-0001: Go Service Manager Over Bash](./0001-go-service-manager-over-bash.md)

---

**Last Updated:** 2026-03-30
