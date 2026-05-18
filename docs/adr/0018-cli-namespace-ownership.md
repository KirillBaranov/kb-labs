# ADR-0018: CLI Namespace Ownership — 1 Manifest = 1 Namespace

**Date:** 2026-05-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-18
**Tags:** cli, security, plugins, registry

## Context

The KB Labs CLI supports third-party plugins installed from npm, git, or local paths — not just
packages published through the official marketplace. Any plugin can declare CLI commands under
any top-level group name (e.g. `analytics report`, `tools build`).

Before this ADR, the plugin registry used a **silent last-writer-wins** strategy: if two plugins
registered commands under the same top-level group (`analytics`), the second registration would
silently overwrite the first. This created two problems:

1. **Predictability**: the set of registered commands depended on discovery order, which is
   non-deterministic across installs.

2. **Security surface**: a malicious package could install itself alongside a legitimate plugin,
   use the same top-level group name, and silently replace or augment its commands — redirecting
   users to attacker-controlled handlers.

A full security audit of the registry identified the following attack vectors:

| # | Vector | Status before ADR |
|---|--------|-------------------|
| 1 | Shadow system command (`auth login`, `platform provision`) | Protected — `systemRouter` has absolute priority |
| 2 | Alias → system command (`aliases: ['auth login']`) | Protected — aliases checked against `systemRouter` |
| 3 | Group namespace hijacking (plugin-vs-plugin) | **Unprotected — this ADR** |
| 4 | `__complete` / `__internal` path injection | **Unprotected — this ADR** |
| 5 | Empty segments (`path: ''`) | **Unprotected — this ADR** |
| 6 | Excessive path depth (`a b c d e f g h i j`) | **Unprotected — this ADR** |
| 7 | `packageName` spoofing | Protected — set by discovery from `package.json`, not manifest |
| 8 | `_synthetic: true` self-declaration | Benign — plugin simply skips registration |
| 9 | `groupMeta` overwriting system descriptions | Protected — `setGroupDescribe` targets `pluginRouter` only |

The primary goal of this ADR is to address vectors 3–6.

## Decision

**One manifest package = one top-level namespace.** The first `packageName` (taken from
`package.json` during discovery, not from the manifest itself) to register any command under a
top-level group name becomes the **owner** of that group. Any subsequent package with a *different*
`packageName` that attempts to register a command under the same top-level group is rejected:
the command is marked `shadowed: true` and a warning is emitted via the platform logger.

The same rule applies to aliases: an alias that points into a namespace already owned by a
different package is silently skipped.

A package may register multiple commands under the same namespace it already owns (co-fill).

Additionally, a **validation layer** is enforced before any registration attempt:

- **Empty path** — segments array is empty after parsing → rejected.
- **Reserved namespaces** — `__complete` and `__internal` are platform-internal → rejected.
- **Excessive depth** — paths deeper than 6 segments → rejected.

These rules are implemented in `TrieBackedRegistry.registerManifest()` via `validateSegments()`.

### Ownership tracking

Ownership is stored on the root trie node of each top-level group (`TrieNode.ownerPackage`).
The value is `cmd.packageName ?? '__unknown__'`. Packages with no `packageName` are pooled
under `'__unknown__'` and can co-fill each other's namespaces (consistent with discovery
behavior for local / uninstrumented packages).

### Logging

All rejections are emitted via `ILogger` (from `@kb-labs/core-platform`), not `console.warn`.
The registry uses a noop logger by default and receives the platform logger via `setLogger()`
called from `registerBuiltinCommands`. This keeps tests noise-free while surfacing warnings
in production.

## Consequences

### Positive

- **Predictable routing** — command resolution is deterministic regardless of plugin install order.
- **System command safety** — already enforced; this ADR adds equivalent protection at the plugin layer.
- **Explicit diagnostics** — namespace conflicts surface as warnings in the platform log, not silent drops.
- **Sandboxing foundation** — sets the groundwork for stricter signature/provenance checks in the future.

### Negative

- **Split-package constraint** — a plugin that ships commands across two npm packages (e.g.
  `@kb-labs/marketplace` and `@kb-labs/marketplace-cli`) must use the same `packageName` field
  (or the same npm package name) to avoid rejection. Teams that split a plugin must coordinate
  namespace ownership.
- **`__unknown__` pooling** — local plugins without a `packageName` share an ownership bucket,
  which could allow unexpected co-fill. This is an acceptable trade-off for dev workflows.

### Alternatives Considered

- **Central namespace registry** (explicit reservation table): rejected — requires a public
  marketplace authority that does not yet exist. The implicit first-come-first-served rule is
  sufficient for the current scale.

- **Cryptographic signing** (only signed packages may register commands): rejected as overkill
  for the current threat model. Package provenance checks are a future concern tracked separately.

- **Per-command collision detection** (allow same group, block same path): rejected because it
  only prevents exact path collisions and does not address the broader namespace hijacking threat.

## Implementation

Changes introduced by this ADR:

| File | Change |
|------|--------|
| `cli/commands/src/registry/trie-router.ts` | Added `ownerPackage?: string` to `TrieNode`; `insertCommand` returns collision metadata |
| `cli/commands/src/registry/service.ts` | `validateSegments()` guard; `ILogger` injection via `setLogger()`; collision result handling in `registerManifest()` |
| `cli/commands/src/utils/register.ts` | `registry.setLogger(log)` called after logger initialisation |
| `cli/commands/src/registry/__tests__/collision.test.ts` | Test suites: *Plugin-vs-Plugin Namespace Ownership* (7 tests) and *Validation* (4 tests) |

## References

- [ADR-0015: CLI Path Routing](./0015-cli-path-routing.md)
- [`TrieBackedRegistry` implementation](../../cli/commands/src/registry/service.ts)
- [`TrieRouter` implementation](../../cli/commands/src/registry/trie-router.ts)

---

**Last Updated:** 2026-05-18
**Next Review:** —
