# ADR-0009: E2E Encryption Deferred to Backlog

**Date:** 2026-03-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-05
**Tags:** [security, host-agent, transport]

## Context

The original cloud architecture plan included E2E encryption for the Host Agent ↔ Gateway channel:
- X25519 keypair generated on the client machine at registration
- Private key stored in `~/.kb/agent.json` (never leaves the machine)
- Public key sent to Gateway on `hello`, stored in ICache
- Gateway encrypts `call` message payloads with the host's public key
- Agent decrypts with its private key
- Goal: server never sees plaintext local files even if the VPS is compromised

The question was raised: is E2E encryption necessary for the target use case?

## Decision

E2E encryption is **deferred to the backlog**. It will not be implemented in the current development phase.

The transport layer already uses WSS (TLS), which provides:
- Encryption in transit against network-level MITM attacks
- Server authentication via TLS certificate

For the primary target scenario — a **single developer deploying to their own VPS** (Hetzner, Oracle Cloud, etc.) — TLS is sufficient. The user already trusts the server they own and operate.

E2E encryption solves a different threat model: **the server itself is untrusted** (multi-tenant SaaS, hosted service where users don't control the server). This is not the current use case.

## Consequences

### Positive

- Significantly simpler implementation — no crypto primitives, no keypair management, no key rotation
- No performance overhead from asymmetric encryption on every capability call
- No UX complexity at registration (`kb agent register` stays simple)
- No key storage / recovery problem for users

### Negative

- The VPS operator (or anyone with root on the server) can read plaintext file contents passing through Gateway
- Not suitable for a future multi-tenant hosted offering where users don't trust the platform operator

### Alternatives Considered

- **Implement E2E now** — rejected: adds significant complexity with zero practical benefit for the self-hosted single-user scenario. Would delay shipping working cloud mode.
- **Encrypt only sensitive file types** — rejected: heuristic-based filtering is unreliable and adds complexity without a clear security model.

## Implementation

No code changes required. The `hello` message in the WS protocol has an optional `publicKey` field reserved in the schema — this can be used when E2E is implemented without a breaking protocol change.

When this is revisited, the implementation path is:
1. `kb agent register` generates X25519 keypair, stores private key in `~/.kb/agent.json`
2. `hello` message includes `publicKey`
3. Gateway stores `publicKey` in ICache alongside host descriptor
4. Gateway encrypts `call` payload with `publicKey` before sending
5. Host Agent decrypts with `privateKey` before dispatching to capability handler

## References

- [Cloud Architecture v2 Roadmap](../../docs/plans/2026-03-04-cloud-architecture-v2-roadmap.md)
- [Gateway WS Protocol](../../../kb-labs-host-agent/packages/host-agent-contracts/src/)

---

**Last Updated:** 2026-03-05
