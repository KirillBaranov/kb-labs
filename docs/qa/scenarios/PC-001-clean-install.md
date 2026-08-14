---
id: PC-001
area: platform-core
title: Clean V2 install from released artifacts
priority: P0
env: clean machine or isolated platform root
---

## Goal

Verify the published launcher can turn the released, sealed V2 index into a
verified platform installation. This is not a source-tree or cache-assisted
test.

## Environment

- [ ] Released `kb-create` binary in `PATH`
- [ ] Node and pnpm supported by the release
- [ ] Empty `PLATFORM_ROOT` and no pre-existing `node_modules` below it
- [ ] Downloaded `release-index.json` from the candidate or stable release
- [ ] `kb-dev` supplied by the release (or an explicit test double only in CI)

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | `kb-create --version` | Prints launcher version without a stack trace |
| 2 | `kb-create wizard --index release-index.json --request-platform-root "$PLATFORM_ROOT" > request.json` | Wizard offers only compatible selections and emits one V2 request |
| 3 | `kb-create plan --index release-index.json --input request.json` | JSON response has `ok: true`, exact artifacts and a service graph; nothing is written under the root |
| 4 | `kb-create apply --index release-index.json --input request.json` | One verified application; output includes `receipt` and `logPath` |
| 5 | Inspect `$PLATFORM_ROOT/.kb/kb.config.jsonc` and `$PLATFORM_ROOT/.kb/devservices.yaml` | Both exist, parse, and match the selected profile and service graph |
| 6 | `kb-create doctor --platform-root "$PLATFORM_ROOT"` | JSON response is `ok: true`, or names each missing manifest requirement and its hint |
| 7 | `kb-dev status --json` | The services equal the receipt/devservices graph |
| 8 | Repeat `plan` with the same input | Identical plan hash/artifacts; no package or config mutation |

## Pass criteria

No artifact is selected from ambient `node_modules`; configuration and service
metadata come from the published manifests. Any failure has a stable error
code, a hint, a transcript under `.kb/logs/`, and a redacted diagnostic dossier
under `.kb/diagnostics/`.
