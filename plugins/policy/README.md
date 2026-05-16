# @kb-labs/policy

> Policy enforcer — governance rules for workspace development boundaries and API compatibility.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-policy%20%7C%20governance%20%7C%20boundaries%20%7C%20api-compat-lightgrey)

---

## Overview

Policy Enforcer applies rule sets to your workspace changes. It detects which
repo category applies to the changed code (e.g. `sdk-boundary`, `core`, `plugin`),
runs the relevant rules, and exits with code `1` on violations. Use it as a CI
gate or in a pre-push hook to catch cross-layer import violations and API
breaking changes before they land.

---

## Features

- Category detection from git diff or explicit path
- Per-category rule resolution — only applicable rules run
- API compatibility check via snapshot diff (catches breaking changes post-publish)
- Snapshot management — capture exported symbols from `dist/*.d.ts`
- JSON output for CI and agent consumption
- Read-only by default — only writes to `.kb/api-snapshots/`

---

## Requirements

**KB Labs platform** `>= 0.1.0`

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/policy-entry
```

---

## Commands

```bash
kb policy detect                          # detect policy category from git diff
kb policy detect --path plugins/commit    # explicit path
kb policy detect --json

kb policy check                           # run policy rules, exit 1 on violations
kb policy check --path plugins/commit
kb policy check --json                    # structured output for CI

kb policy rules                           # list all configured rules + categories
kb policy rules --json

kb policy snapshot --path packages/sdk    # capture API snapshot after publish
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb policy detect` | Detect applicable policy category |
| `kb policy check` | Run policy checks (CI gate, exits 1 on violations) |
| `kb policy rules` | Show all configured rules |
| `kb policy snapshot` | Capture API snapshot from dist types |

---

## Artifacts

| Path | Description |
|------|-------------|
| `.kb/api-snapshots/` | Exported symbol snapshots per repo |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Filesystem (r) | `.`, `.kb/api-snapshots/**` | Read source and snapshots |
| Filesystem (rw) | `.kb/api-snapshots/**` | Write new snapshots |
| Quotas | 15–60 sec timeout, 128–256 MB RAM | Policy analysis |

---

## Changelog

### 0.1.0

- Initial release: detect, check, rules, snapshot commands

---

## License

MIT
