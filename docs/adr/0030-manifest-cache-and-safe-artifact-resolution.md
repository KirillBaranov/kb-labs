# ADR-0030: Safe Manifest Artifact Resolution and Cache

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** security, installer, tooling

## Context

Agent and CI installation may resolve package metadata repeatedly. Running
package lifecycle scripts or unpacking untrusted archive paths would be both
unnecessary and unsafe.

## Decision

Registry resolution uses `npm pack --ignore-scripts` in an isolated temporary
directory, extracts only safe regular files/directories, rejects absolute and
parent-traversal archive paths, and evaluates only the declared manifest
module. Normalized manifests and digests may be persisted in a cache keyed by
package name and version; secrets and package contents are never cached.

## Consequences

Resolution is reproducible and cheap after the first pass. A changed package
with the same version must be released with a new version; cache invalidation
is intentionally version-based and digest-visible.
