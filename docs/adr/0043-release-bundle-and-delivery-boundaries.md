# ADR-0043: Release Bundle and Delivery Boundaries

**Date:** 2026-08-31
**Status:** Accepted
**Deciders:** KB Labs Team
**Tags:** release, contracts, workflow, ci, provenance

## Context

ADR-0041 assigns release-index generation to a preparation script and
ADR-0042 still allows CI to build candidate artifacts. That permits the plan,
package membership and bytes delivered to users to be decided in different
execution environments.

The release control plane requires one opaque, immutable artifact that a human
approves and that CI can only deliver. Contracts must have strict schemas and
one canonical SHA-256 protocol in TypeScript and Go.

## Decision

The release plugin owns all release-domain decisions: version policy, package
membership, compatibility, release-index generation, bundle contents and
validation. It produces a sealed `ReleaseBundle` containing the release intent,
exact npm tarballs, binaries, descriptor, index and evidence.

Workflow owns operational state. It atomically records receipt transitions,
version reservations and leases, stores the approved bundle, and dispatches CI
with only `{receiptId, candidateId, bundle locator, expected bundle digest,
operation}`.

CI verifies the externally supplied bundle digest before reading it and may
only publish, reuse, verify or conditionally activate exact files from that
bundle. CI does not plan, version, stage, package, build, regenerate an index
or infer a channel.

All release-control-plane documents use strict versioned JSON schemas and
canonical JSON: UTF-8, recursively sorted object keys, no insignificant
whitespace and lowercase SHA-256 hex. Contract numbers are safe integers only.

## Consequences

- `ReleaseIntent`, `ReleaseBundle`, `ReleaseReceipt`, `DeliveryEvidence`,
  `ReleaseDescriptor`, `ReleaseChannelPointer`, `ReleaseDeliveryRequest`,
  `StablePromotionPlan` and `ReleaseSupportPolicy` become explicit boundary
  contracts.
- The Go installer and TypeScript release plugin share golden canonicalization
  fixtures, preventing divergent digest implementations.
- The conflicting ownership statements in ADR-0041 and ADR-0042 are superseded
  by this ADR. Their historical description of the old pipeline remains useful,
  but it is not normative for the cutover.
- Delivery retries can reuse only a bundle with the same approved digest;
  mismatched bytes are a hard conflict.
