---
id: S-024
title: Platform — rollback to a V2 snapshot
persona: solo-developer
priority: P1
automation: e2e-done
e2e: tools/kb-create/v2/runtime/runtime_test.go; tools/kb-create/v2/lifecycle/lifecycle_test.go
---

## Goal

Restore a known V2 snapshot after a bad update without recalculating an old
plan or manually editing generated configuration.

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | Apply a verified update and record its previous snapshot ID | Snapshot is immutable and associated with the platform root |
| 2 | `kb-create rollback --platform-root "$PLATFORM_ROOT" --snapshot SNAPSHOT_ID` | JSON result includes the restored snapshot and log path |
| 3 | Inspect receipt, `kb.config.jsonc`, `devservices.yaml` and `kb-dev status --json` | All agree with the restored service graph |
| 4 | Request a missing/unknown snapshot | Non-zero structured recovery error with a hint; active install remains unchanged |
| 5 | Run `kb-create doctor --platform-root "$PLATFORM_ROOT"` | Any remaining manifest requirement is reported explicitly |

## Pass criteria

Rollback is receipt/snapshot based, preserves secrets, and never uses an
ambiguous “latest previous release” heuristic.
