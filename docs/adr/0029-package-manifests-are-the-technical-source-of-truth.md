# ADR-0029: Package Manifests Are the Technical Source of Truth

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, plugin-system, installer, monorepo

## Context

The monorepo contains separately released plugins, services, and adapters.
Maintaining their requirements and capabilities again in kb-create would
recreate the compatibility drift we are removing.

## Decision

Every released package declares `kb.manifest` in its `package.json`. kb-create
resolves that module from an exact local package artifact or exact registry
package spec, normalizes plugin/service/adapter schemas into one catalog, and
uses the result for requirements, capabilities, and adapter configuration
defaults. The embedded kb-create manifest remains only the bootstrap/product
catalog for stable IDs, defaults, and package selection.

## Consequences

Changing a package's technical contract changes installer input at the package
boundary. Separate releases remain possible. A package without a valid
manifest fails resolution instead of silently receiving guessed compatibility.

## Implementation

See `internal/engine/catalog/resolve.go`, `registry.go`, `cache.go`, and
`bootstrap.go`. Package identity, version, manifest digest, and source path are
retained for deterministic planning and diagnostics.
