---
id: S-023
title: Platform — update from a new sealed index
persona: solo-developer
priority: P0
automation: e2e-done
e2e: tools/kb-create/v2/runtime/runtime_test.go; tools/kb-create/v2/lifecycle/lifecycle_test.go
---

## Goal

Update an existing verified V2 installation without resolving versions from
ambient state or losing a recoverable snapshot.

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | Save the active receipt, generated-config hashes and `kb-dev status --json` | Establishes the known-good snapshot/graph |
| 2 | Build a request using the newer sealed index and run `kb-create plan` | Shows exact changed artifacts and resulting graph before mutation |
| 3 | Run `kb-create update --index release-index.json --input request.json` | Snapshot is created, update is verified, output includes receipt, snapshot and log path |
| 4 | Inspect config/devservices and `kb-dev status --json` | All three agree with the new receipt |
| 5 | Simulate a failed verification in a controlled fixture | Runtime restores the preceding snapshot rather than leaving a partial install |
| 6 | Run the same update again | Deterministic no-drift result; no unannounced version change |

## Pass criteria

Update uses the resolved V2 plan and receipt/snapshot recovery model. It does
not rewrite user-provided secrets, infer a plugin version, or call a legacy
marketplace lock scan.
