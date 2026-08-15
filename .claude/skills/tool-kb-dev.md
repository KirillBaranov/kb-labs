---
name: tool-kb-dev
description: Manage KB Labs local services with kb-dev: start, stop, status, health, and logs.
globs:
  - "tools/kb-dev/**"
  - "**/devservices.yaml"
  - ".kb/devservices.yaml"
---

# kb-dev

Use `kb-dev`, not `node <service entrypoint>`, to run local services.

For `start`, `restart`, and `ensure`, this repository requires both flags:

```bash
kb-dev start --config <path-to-devservices.yaml> --net-offset 0
kb-dev start backend --config <path-to-devservices.dev.yaml> --net-offset 0
kb-dev restart gateway --config <path-to-devservices.yaml> --net-offset 0
```

Useful read-only operations:

```bash
kb-dev status --json
kb-dev health
kb-dev logs <service>
kb-dev doctor
```

- The usual files are `.kb/devservices.yaml` (base) and `.kb/devservices.dev.yaml` (optional development services), but they are machine-local and may not exist in a fresh checkout.
- Resolve parallel-worktree conflicts with a network offset, not by changing configured ports.
- `stop` and `status` do not need start flags. Logs and state live under `.kb/logs/tmp/` and `.kb/tmp/`.
