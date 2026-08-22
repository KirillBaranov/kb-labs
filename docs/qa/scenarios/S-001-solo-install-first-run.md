---
id: S-001
title: Solo — install and first verified run
persona: solo-developer
priority: P0
automation: e2e-done
e2e: tools/kb-create/v2/journey/offline_test.go; .github/workflows/release-deliver-candidate.yml (launcher-smoke)
---

## Goal

On a clean root, a developer obtains a deterministic plan from the released
index, applies it, and receives generated configuration that matches the
verified service graph.

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | Obtain the published `release-index.json` and run the V2 wizard or construct a V2 request | No legacy positional-project/`--demo` path is used |
| 2 | Run `kb-create plan --index release-index.json --input request.json` | Exact versions, provider bindings and service graph are displayed before mutation |
| 3 | Run `kb-create apply --index release-index.json --input request.json` | Exact artifacts install in one transaction and a receipt is written only after verification |
| 4 | Inspect `.kb/kb.config.jsonc` and `.kb/devservices.yaml` under the platform root | Both are generated from the resolved plan and selected package manifests |
| 5 | Run `kb-create doctor --platform-root "$PLATFORM_ROOT"` | Missing input is reported by manifest owner/code/hint; secret values are not printed |
| 6 | Start/status the released service graph | `kb-dev status --json` agrees with the receipt and devservices graph |
| 7 | Force a recoverable generated-file drift, then run `doctor --fix` | Only manifest-declared safe defaults/derived files are repaired; a secret is never guessed |

## Automated evidence

The offline journey covers deterministic application, manifest diagnosis and
recovery without network variance. The platform candidate workflow separately
uses the exact public npm candidate bytes to render a clean installation. Full
service startup is owned by the sharded E2E suites, not hidden inside launcher
smoke.
