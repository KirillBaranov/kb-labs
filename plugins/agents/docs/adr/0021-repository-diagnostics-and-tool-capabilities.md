# ADR 0021: Probe-Based Repository Diagnostics and Tool Capability Layer

## Status
Accepted

## Context
KB Labs agents must work not only against KB Labs repositories, but also against arbitrary product repositories inside the IDP. A single default detector biased toward Node/TypeScript is not a stable foundation for that use case.

At the same time, tool access should not be controlled only by tool names. The runtime needs a capability layer that can describe both internal and future external tools through a shared contract.

## Decision
We introduce two explicit extension layers:

1. Repository diagnostics
- `RepositoryDiagnosticsProvider` remains the high-level runtime surface.
- Default diagnostics are implemented as an orchestrator over multiple `RepositoryProbe`s.
- Probes contribute partial observations for topology, stack fingerprints, workspace layout, conventions, and risk signals.
- Repository understanding is score-based through `RepositoryFingerprints`, not hardcoded around a single ecosystem.

2. Tool capability layer
- `ToolCapability` becomes the shared capability vocabulary for tool access.
- `ToolPolicy` can restrict or allow capabilities in addition to explicit tool names.
- `ToolGateway` applies capability checks independently from repository diagnostics and kernel state.

## Consequences
- The runtime no longer depends on a monolithic Node-centric detector.
- New ecosystem support is added by registering new probes, not by rewriting the default provider.
- Internal and future external tools can be filtered through the same capability contract.
- `KernelState` remains the only continuity truth source; repository diagnostics stay as derived runtime context.

## Initial built-in probes
The default provider includes probes for:
- topology
- conventions
- JavaScript/TypeScript
- Python
- Go
- PHP
- JVM (Java/Kotlin)
- Rust
- Ruby
- generic workspace layout

## Follow-up
- Add richer framework-specific probes over time without touching `RuntimeEngine`.
- Feed repository diagnostics into profile overlays and prompt projectors.
- Add external tool providers that declare capabilities instead of relying on name-only policies.
