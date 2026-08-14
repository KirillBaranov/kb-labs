---
id: S-025
title: Platform — diagnose and safely repair a V2 setup
persona: solo-developer
priority: P1
automation: e2e-done
e2e: tools/kb-create/v2/doctor/doctor_test.go; tools/kb-create/v2/doctor/config_test.go; tools/kb-create/v2/journey/offline_test.go
---

## Goal

A broken composition is diagnosable from its receipt and installed manifests,
with one structured answer for both a person and an agent.

## Steps

| # | Action | Expected |
|---|---|---|
| 1 | Remove a required non-secret config value in an isolated fixture | `kb-create doctor --platform-root "$PLATFORM_ROOT"` returns a finding with owner, path, stable code and hint |
| 2 | Omit a required secret | Finding says only `missing`; it never prints the value or writes it to logs/telemetry |
| 3 | Create a stale generated service graph | Doctor/verification identifies graph drift instead of a later opaque service failure |
| 4 | Run `kb-create doctor --fix --platform-root "$PLATFORM_ROOT"` for a safe default or derived-file repair | A snapshot is taken and only manifest-declared safe repair occurs |
| 5 | Run `doctor --fix` with required user/secret input still missing | Fails safely with input requirement; no invented value/provider |
| 6 | Cause an apply/recovery failure | JSON includes `code`, `stage`, message, hint, `logPath` and redacted `diagnosticPath` |

## Pass criteria

Diagnosis compares effective configuration with the manifests of the artifacts
recorded in the active receipt. It does not rely on old marketplace lock files,
parsing terminal text, or raw stack traces.
