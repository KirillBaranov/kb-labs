# @kb-labs/impact

> Impact analysis — see which packages and docs are affected by your changes.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-impact%20%7C%20analysis%20%7C%20dependencies%20%7C%20docs-lightgrey)

---

## Overview

Impact Analysis answers "what does this change break?" before you push.
Given the current workspace changes, it traces the dependency graph to show
directly changed packages, packages that depend on them, and transitively
affected packages. It also flags documentation files that are stale and need
review based on the same change set.

---

## Features

- Full impact analysis in one command: packages + docs combined
- Package impact: direct changes → dependents → transitive affected
- Documentation impact: stale docs that need review after code changes
- JSON output for CI pipelines, agents, and workflow steps
- Read-only — no side effects, safe to run anytime

---

## Requirements

**KB Labs platform** `>= 0.1.0`

No platform services required.

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/impact-entry
```

---

## Commands

```bash
kb impact check                        # full analysis: packages + docs
kb impact check --json                 # JSON output for agents/CI

kb impact packages                     # package dependency impact only
kb impact packages --json

kb impact docs                         # stale documentation impact only
kb impact docs --json
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb impact check` | Full impact analysis (packages + docs) |
| `kb impact packages` | Package dependency impact |
| `kb impact docs` | Documentation staleness impact |

All commands support `--json` for machine-readable output.

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Filesystem (r) | `**/*` | Read source files and git state |
| Quotas | 30 sec timeout, 256 MB RAM | Lightweight analysis |

---

## Changelog

### 0.1.0

- Initial release: check, packages, docs commands

---

## License

MIT
