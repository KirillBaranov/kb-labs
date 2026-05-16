# @kb-labs/qa

> Automated quality checks, baseline tracking, and regression detection.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-qa%20%7C%20baseline%20%7C%20regression%20%7C%20testing-lightgrey)

---

## Overview

QA plugin runs build, lint, type check, and tests across your monorepo, saves
results as a baseline, and detects regressions on subsequent runs. Use it as
a pre-merge gate in workflows, or as a continuous quality monitor with trend
tracking over time.

---

## Features

- Single command (`qa run`) to run all checks: build, lint, types, tests
- Atomic single-check runner (`qa check`) for workflow steps — exit 0 = pass, exit 1 = fail
- Baseline system — save a known-good state and diff against it on every run
- Regression detection — compare last two history entries and fail on new failures
- Trend analysis — quality direction over a sliding window of runs
- Per-package timelines and grouped error patterns
- JSON output everywhere for agent and CI consumption

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Platform services**

| Service | Required | Purpose |
|---------|----------|---------|
| `storage` | Required | History and baseline persistence |
| `cache` | Optional | Result caching |
| `analytics` | Optional | Usage tracking |

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/qa-entry
```

---

## Commands

### Running checks

```bash
kb qa run                              # all checks: build, lint, types, tests
kb qa run --json
kb qa check --id=types                 # single check atomically
kb qa save                             # run + save to history
```

### History and trends

```bash
kb qa history                          # run history with pass/fail per check
kb qa trends                           # quality direction over time
kb qa regressions                      # detect new failures vs last run (exits 1 if found)
```

### Baseline management

```bash
kb qa baseline update                  # run full QA and save as new baseline
kb qa baseline status                  # show current baseline snapshot
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb qa run` | Run all QA checks |
| `kb qa check` | Run a single check atomically |
| `kb qa save` | Run + save to history |
| `kb qa history` | Show run history |
| `kb qa trends` | Quality trends |
| `kb qa regressions` | Detect regressions (CI gate) |
| `kb qa baseline update` | Save current results as baseline |
| `kb qa baseline status` | Show baseline snapshot |

---

## REST API

Requires the `gateway` plugin.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/plugins/qa/summary` | Overall QA summary |
| `GET` | `/v1/plugins/qa/latest` | Latest run results |
| `GET` | `/v1/plugins/qa/history` | Run history |
| `GET` | `/v1/plugins/qa/trends` | Quality trends |
| `GET` | `/v1/plugins/qa/regressions` | Regression report |
| `GET` | `/v1/plugins/qa/baseline` | Current baseline |
| `POST` | `/v1/plugins/qa/run` | Trigger a QA run |
| `GET` | `/v1/plugins/qa/details` | Per-package error details |
| `POST` | `/v1/plugins/qa/run/check` | Run a single check type |
| `POST` | `/v1/plugins/qa/baseline/update` | Update baseline |
| `GET` | `/v1/plugins/qa/baseline/diff` | Diff vs baseline |
| `GET` | `/v1/plugins/qa/packages/:name/timeline` | Per-package QA timeline |
| `GET` | `/v1/plugins/qa/errors/groups` | Errors grouped by pattern |

---

## Studio

Adds a **QA** page to KB Labs Studio (sidebar order 50).

| Page | Route | Description |
|------|-------|-------------|
| QA | `/p/qa` | Quality dashboard, history, regressions |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Filesystem (rw) | `**` | Run checks across monorepo |
| Environment | `KB_*` | Platform configuration |
| Platform | `cache`, `analytics` | Caching and tracking |
| Quotas | 10 min timeout, 2 GB RAM | Full monorepo check suite |

---

## Changelog

### 0.1.0

- Initial release: run, check, save, history, trends, regressions, baseline commands + REST API + Studio

---

## License

MIT
