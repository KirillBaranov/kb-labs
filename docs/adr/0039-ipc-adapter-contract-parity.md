# ADR-0039: IPC Adapter Contract Parity

**Date:** 2026-08-10
**Status:** Accepted
**Deciders:** KB Labs Team
**Tags:** adapters, ipc, contracts, plugins

## Context

Platform adapters are used both directly and through process IPC, child IPC,
and Unix sockets. Each transport previously owned its own adapter-to-platform
mapping, while proxies maintained their method lists independently. This made
it possible for a valid adapter operation to be available to the platform in
one execution mode and absent in another.

That difference is unacceptable for the plugin model: a plugin must observe
the same adapter contract as platform code for a given configured adapter.

## Decision

IPC is a transparent transport for public adapter contracts. A public adapter
operation must have the same documented semantics for direct and IPC callers.
Platform code does not receive hidden adapter methods or a broader variant of
the same adapter.

Every IPC-exposed adapter will have:

- one canonical wire identifier to platform-slot route;
- an exhaustive operation inventory, checked against its TypeScript contract;
- a declared wire mode for every operation: `unary`, `stream`, or
  `interactive`;
- a proxy surface test that must exactly match the operation inventory;
- behavioural contract-suite runs both directly and through an IPC loopback
  once the operation's wire mode is implemented.

Unsupported wire modes are not allowed to masquerade as unary RPC. They must
be implemented by the protocol before the operation can be considered IPC
transparent, or the public adapter contract must be redesigned around a
portable primitive.

## Consequences

### Positive

- Adding an adapter method forces an explicit IPC decision at compile time.
- Process, child-process, and Unix-socket transports resolve the same adapter
  endpoints.
- Direct and plugin callers retain equal rights to configured adapters.
- Streaming, cancellation, and transaction semantics become visible design
  work rather than accidental proxy limitations.

### Negative

- Adapter changes require updates to both the public contract and its IPC
  inventory.
- Some existing contracts require protocol work before they can honestly be
  called IPC-transparent, notably async iteration and callback transactions.

### Alternatives Considered

- **Document proxy limitations only.** Rejected: documentation does not stop
  plugins from receiving a weaker contract than the platform.
- **Give platform code a private full adapter.** Rejected: this creates
  privileged semantics and defeats the common abstraction boundary.
- **Create one adapter interface per transport.** Rejected: it multiplies
  adapter types instead of making the existing ones reliable.

## Implementation

The first increment centralizes all wire-to-slot routes and introduces checked
operation inventories for `IDocumentDatabase` and `IKVStore`. Follow-up work
will add wire codecs and behavioural direct-versus-IPC contract suites,
starting with the declared `stream` and `interactive` operations.

Adapter-specific fields and capabilities are intentionally outside this ADR;
they are formalized only after this transport parity layer is stable.

## References

- [Adapter audit](../adr/0034-state-broker-is-a-state-cache-not-an-icache-adapter.md)

---

**Last Updated:** 2026-08-10
