# ADR-0042: Release Engine Control Plane and CI Delivery Plane

**Date:** 2026-08-22  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Tags:** release, workflow-engine, ci, artifacts, provenance

## Context

The release workflow currently has two execution environments. The local KB
workflow engine owns the release plan and approval, while GitHub Actions stages
packages, builds binaries, publishes candidates and runs post-publish smoke.
That split is workable, but it leaves release decisions duplicated in CI and
requires a platform release to receive a binary manifest as a manual input.

The compatibility matrix must contain the checksums and URLs of the exact
binary bytes that are published. Rebuilding binaries independently in local
workflow execution and in GitHub Actions cannot provide that guarantee.

## Decision

The KB workflow engine is the release control plane. GitHub Actions is the
artifact execution and delivery plane.

The engine owns:

- release plan, flow, version and channel selection;
- checks, compatibility decisions and release-index generation;
- approval and state transitions;
- candidate and stable promotion policy;
- retry, resume and rollback decisions.

CI owns only the execution required to produce or deliver an explicitly
identified candidate:

- build the candidate artifacts once on a controlled runner;
- create the immutable candidate bundle and its provenance;
- publish the exact bundle to canary or stable targets;
- run post-publish smoke and return evidence.

CI must not recompute versions, choose package membership, resolve
compatibility, rebuild an already sealed bundle, or publish an unverified
candidate.

## Candidate contract

Every release candidate is identified by a stable `candidateId` and an
immutable `bundleSha256`. The bundle contains:

```text
release-bundle/
  release-index.json
  binary-manifest.json
  npm/manifest.json
  npm/*.tgz
  provenance.json
  bundle.sha256
```

`provenance.json` records the source commit, flow, version, channel, toolchain,
CI run, release-index digest, artifact digests and validation evidence. The
release-index is sealed only after the exact binary manifest is available.

The engine dispatches a reusable candidate workflow with an immutable release
intent containing at least:

```json
{
  "schema": "kb.release-intent/1",
  "candidateId": "platform-2026-08-22T12:00:00Z-<nonce>",
  "commit": "<full git sha>",
  "flow": "platform",
  "version": "<exact version>",
  "channel": "canary"
}
```

The workflow returns the candidate ID, bundle digest, release-index digest,
CI run ID and smoke evidence. Delivery workflows accept the candidate ID and
digest; they do not accept a free-form manifest path as a release decision.

## State machine

```text
planned
  -> approved
  -> building
  -> candidate-ready
  -> canary-published
  -> smoke-passed
  -> stable-approved
  -> stable-promoted
```

Transitions are persisted and resumable. A repeated delivery request for the
same candidate digest is idempotent. Promotion is allowed only when the
candidate, bundle digest and successful post-publish evidence all match.

## Security and credentials

The local engine does not publish GitHub releases, upload artifacts or hold
production npm credentials. It may dispatch a reusable workflow through an
explicitly configured integration, but artifact creation and publication run
on controlled CI runners using scoped credentials and OIDC where supported.

## Cutover

The cutover is deliberately breaking. There is no backward-compatibility
period, dual-run mode or legacy delivery adapter. The old release paths are
removed when the new path is enabled.

The cutover sequence is:

1. define and validate the candidate bundle and release-intent contracts;
2. add a reusable candidate workflow that creates the binary manifest from the
   exact GoReleaser checksums and seals the release-index;
3. make npm and binary delivery workflows consume the bundle without staging
   or rebuilding;
4. add workflow-engine dispatch, polling and evidence persistence;
5. replace the old tag workflows with the reusable delivery workflows;
6. delete the manual binary-manifest input, old staging paths and all legacy
   release dispatchers.

An incomplete cutover is not a supported production state: the new workflow
engine path either owns the release train, or the release is blocked.

## Consequences

The release train gains one auditable candidate identity across platform, SDK
and binaries. Delivery retries do not create a different artifact, and the
same release-index can be used by human, agent and CI launcher paths.

The workflow engine needs a GitHub Actions adapter for dispatch and evidence
polling, and the repository needs a durable candidate bundle store. These are
explicit dependencies of the migration, not reasons to weaken the exact-byte
contract.
