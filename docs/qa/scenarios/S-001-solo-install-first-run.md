---
id: S-001
title: Solo — install and first verified run
persona: solo-developer
priority: P0
automation: e2e-done
e2e: tools/kb-create/v2/journey/offline_test.go; tools/kb-create/install_test.sh (bootstrap); plugins/release/manager-cli/src/shared/__tests__/control-plane-release-e2e.test.ts (candidate smoke step)
---

## Goal

On a clean root, a developer bootstraps the launcher from the public install
script, resolves a channel through the published control plane, applies the
resulting deterministic plan, and receives generated configuration that matches
the verified service graph.

No step obtains a `release-index.json` by hand. The launcher resolves it, and
`--index` exists only as an explicit offline escape hatch with no fallback
relationship to remote resolution.

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | `curl -fsSL https://kblabs.ru/install.sh \| sh` on linux or darwin | Channel pointer and descriptor are digest-verified at every hop; a windows or otherwise unsupported target is refused with a typed diagnostic naming the four supported combinations |
| 2 | Run `kb-create plan --platform-channel stable --request-platform-root "$PLATFORM_ROOT"` | Exact versions, provider bindings and service graph are displayed before mutation; no local index, npm tag discovery or workspace checkout is consulted |
| 3 | Run `kb-create apply --platform-channel stable --request-platform-root "$PLATFORM_ROOT"` | Exact artifacts install in one transaction and a receipt is written only after verification; the receipt names the exact resolved release id |
| 4 | Inspect `.kb/kb.config.jsonc` and `.kb/devservices.yaml` under the platform root | Both are generated from the resolved plan and selected package manifests |
| 5 | Run `kb-create doctor --platform-root "$PLATFORM_ROOT"` | Missing input is reported by manifest owner/code/hint; secret values are not printed |
| 6 | Start/status the released service graph | `kb-dev status --json` agrees with the receipt and devservices graph |
| 7 | Force a recoverable generated-file drift, then run `doctor --fix` | Only manifest-declared safe defaults/derived files are repaired; a secret is never guessed |

## Automated evidence

The offline journey covers deterministic application, manifest diagnosis and
recovery without network variance. `install_test.sh` covers step 1 against a
stubbed descriptor endpoint, including the digest-mismatch and retired-contract
refusals. The public clean installation of step 3 is no longer a separate
post-publish workflow: it is the candidate saga's own smoke step, which a
release must pass to reach `candidate-smoke-passed` at all.

Full service startup is owned by the sharded E2E suites, not hidden inside
launcher smoke.
