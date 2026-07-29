# ADR-0036: Platform log context and diagnostic contract

**Date:** 2026-07-29
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-29
**Tags:** observability, platform, plugins, logging

## Context

Services, CLI hosts, and plugins previously added log fields independently.
That produced duplicated Pino bindings, aliases such as `reqId`, noisy HTTP
start/health records, and a plugin wrapper that renamed collisions at runtime.
It made correlation unreliable for people and unsafe for agents that must
diagnose a platform from logs alone.

## Decision

The platform owns one typed context logger. Its mandatory identity is
`applicationId`, `serviceId`, `instanceId`, and `layer`. Operation context adds
`component`, `operation`, `requestId`, `traceId`, `spanId`, and `tenantId`.
Plugin execution adds `pluginId`, `pluginVersion`, and `pluginKind`.

Context is inherited parent-first. A child may add absent identity or domain
fields, but cannot replace values already established by the parent. The
implementation writes dynamic scope as record metadata rather than stacking
Pino child bindings, so a JSON record never carries duplicate keys. HTTP,
workflow, and adapter attributes use namespaced keys (`http.*`, `workflow.*`,
`adapter.*`); `reqId` is not part of the contract.

The following lifecycle events are canonical: `platform.starting`,
`platform.ready`, `platform.failed`, `platform.stopping`, `platform.stopped`,
and their `service.*` equivalents. They include relevant outcome, duration,
signal, and exit-code fields.

`fatal` means the process cannot continue; `error` means an operation failed;
`warn` means degraded and actionable; `info` is one meaningful lifecycle or
result summary; `debug` is implementation detail; `trace` is payload or
transport detail. HTTP starts, health probes, route mounts, and per-item work
are debug; a completed business request is info. `KB_LOG_LEVEL=silent`
suppresses all normal logging.

Machine remediation is optional. With `KB_DIAGNOSTICS=agent`, `logger.event()`
may attach a `diagnostic` envelope containing summary, causes, observed versus
expected state, verifiable remediation, and confidence. It must never contain
secrets, tokens, raw environment values, or request payloads. Without the
flag, the envelope is omitted rather than duplicated as human text.

## Consequences

### Positive

- Correlation is stable from service through plugin execution.
- One API prevents accidental identity overwrite and Pino key duplication.
- Log volume follows a predictable taxonomy and respects silent mode.
- Agents can opt into structured, safe remediation without degrading normal logs.

### Negative

- Legacy helpers and `reqId` consumers must migrate in the same change.
- Logger tests must assert context inheritance rather than incidental text.

### Alternatives Considered

- Renaming colliding plugin fields (`plugin_reqId`) was rejected: it preserves
  ambiguous data and hides an invalid producer.
- Separate loggers per service were rejected: they cannot prove propagation
  through plugin and request boundaries.
- Always-on agent diagnostics were rejected because they add noise and risk
  collecting information not appropriate for ordinary operations.

## Implementation

- `core-platform` exports `IContextLogger` and the context/diagnostic types.
- Platform launch and the service runner emit canonical events.
- HTTP and plugin hosts use the context API; tests cover parent-to-plugin inheritance.
- CI rejects legacy correlation helpers, `reqId`, and direct console logging in
  platform-backed entrypoints.

## References

- [ADR-0011 unified logging system](../../core/docs/adr/0011-unified-logging-system.md)

---

**Last Updated:** 2026-07-29
