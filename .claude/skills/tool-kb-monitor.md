---
name: tool-kb-monitor
description: kb-monitor — observe and inspect services deployed via kb-deploy (health, logs, exec)
globs:
  - "tools/kb-monitor/**"
  - "sites/**"
---

# kb-monitor — Monitor Tool

Go binary that observes services deployed via kb-deploy. Provides health checks, status, log streaming, and remote exec.

## Commands

```bash
kb-monitor health                        # check health of all services
kb-monitor health <service>              # check health of a specific service
kb-monitor status                        # show running state, uptime, image SHA
kb-monitor status --json                 # agent-friendly JSON output
kb-monitor logs <service>                # fetch last logs
kb-monitor logs <service> --lines 100    # fetch last N lines
kb-monitor logs <service> --follow       # stream logs live
kb-monitor exec <service> -- <cmd>       # execute a command inside a container
```

## Usage

Binary is at `tools/kb-monitor/kb-monitor`. Run from repo root:

```bash
./tools/kb-monitor/kb-monitor <command>
```

## Workflow

- Use `health` to quickly verify services are up after a deploy
- Use `status --json` when scripting or feeding output to another tool
- Use `logs --follow` to stream live output from a service
- Use `exec` to inspect container internals (e.g. `df -h`, `env`)

## Important

- Works only with services deployed via `kb-deploy`
- Use `status --json` for structured output in automated contexts
