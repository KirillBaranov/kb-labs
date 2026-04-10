# ADR-0010: Capability Adapters for Live Environment Cycle

**Date:** 2026-02-17
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-17
**Tags:** [architecture, platform, adapters, infra-worker]

## Context

Infra worker must support a real end-to-end cycle:

1. materialize workspace
2. provision long-lived environment
3. attach workspace
4. capture and restore snapshots

Existing architecture already separated:

- plugin execution backend (how handlers run)
- infrastructure lifecycle (what environment/workspace/snapshot are)

To make the cycle runnable and extensible, we needed concrete provider implementations while preserving the abstract ports.

## Decision

Adopt capability adapters as the runtime integration boundary:

- `IEnvironmentProvider`
- `IWorkspaceProvider`
- `ISnapshotProvider`

For first live local cycle:

- environment provider: `@kb-labs/adapters-environment-docker`
- workspace provider: `@kb-labs/adapters-workspace-localfs`
- snapshot provider: `@kb-labs/adapters-snapshot-localfs`

Also extend runtime adapter config with explicit keys:

- `platform.adapters.workspace`
- `platform.adapters.snapshot`

## Consequences

### Positive

- Infra worker remains backend-agnostic and orchestrator-friendly.
- A full local cycle can be executed and validated today.
- Teams can replace providers without changing plugin commands/contracts.
- Path to Kubernetes or custom providers stays open via same ports.

### Negative

- LocalFS providers are not remote-cluster-ready.
- Local bind mount assumptions do not hold for remote Docker/K8s.
- Additional provider compatibility tests are required for production rollout.

### Alternatives Considered

- Hardcode Docker/filesystem logic in infra-worker command handlers.
  - Rejected: breaks hexagonal boundary and limits extensibility.
- Delay workspace/snapshot until later and ship environment-only.
  - Rejected: did not satisfy full-cycle “touch and feel” requirement.

## Implementation

Implemented:

- local workspace provider package
- local snapshot provider package
- typed runtime config for workspace/snapshot adapters
- tests for both new provider packages
- live runbook and example platform config

Next:

1. add conformance tests for external providers
2. add remote-ready workspace/snapshot providers (PVC/S3)
3. add orchestrator smoke test (`invoke -> prepare -> gates`)

## References

- `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-infra-worker-plugin/docs/live-local-cycle.md`
- `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-infra-worker-plugin/docs/examples/local-live-platform.config.json`
- `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-core/packages/core-runtime/src/config.ts`

---

**Last Updated:** 2026-02-17
**Next Review:** 2026-03-31
