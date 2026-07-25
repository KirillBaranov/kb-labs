# ADR-0034: StateBroker Is a State Cache, Not an ICache Adapter

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, platform, installer

## Context

Single-user installations should not require Redis merely to retain launcher
or platform state. At the same time, StateBroker's semantics are state
coordination and persistence, not the general `ICache` contract used by plugin
runtime services.

## Decision

StateBroker may be the minimal local state/cache facility for installation and
platform metadata. It is declared and resolved as a StateBroker capability. It
must not be advertised as an implementation of `ICache` unless a separate
adapter explicitly provides that contract. Redis remains an opt-in `ICache`
provider when a workload needs Redis semantics.

## Consequences

Minimal users avoid an unnecessary external service, while plugin compatibility
checks remain truthful. Scenarios may prefer StateBroker for compatible state
needs, but cannot silently satisfy a plugin's `cache` requirement with an
incompatible provider.
