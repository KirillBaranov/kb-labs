# ADR-0038: CI cache policy and authoritative builds

**Date:** 2026-08-03
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-08-03
**Reviewers:** —
**Tags:** ci, performance, testing, reliability

## Context

Building the platform dominates E2E wall-clock time. Caching build outputs is
therefore necessary for PR feedback, but a cache must never be allowed to turn
a stale build or stale package registry into a passing test run.

The former CI configuration mixed three different kinds of state in GitHub
Actions caches: the kb-devkit content-addressable store, packed npm tarballs,
and mutable Verdaccio storage. The latter two are build artifacts/state, not
safe cache values. Their broad or incomplete keys required manual prefix bumps
after a packaging or registry change.

## Decision

CI has two explicit modes:

| Mode | Consumers | Policy |
|---|---|---|
| `read-write` | PR and affected E2E lanes | Restore/save the addressable kb-devkit CAS and BuildKit GHA cache. |
| `off` | Main, scheduled, release-triggered, and release lanes | Build, pack, publish, and image-build cold. No derived-output cache is restored or written. |

`kb-devkit` task keys include the task definition, toolchain fingerprint,
package manifest, and direct dependency `dist` outputs. A cached task is only
eligible when those semantics and inputs match. The external Actions cache is
only a transport for this CAS and is partitioned by workspace configuration.

Packed `.tgz` files and Verdaccio storage are rebuilt for each producing job.
They are passed to same-run consumers as immutable Actions artifacts. Docker
layers use BuildKit's `type=gha` backend in fast lanes, where BuildKit validates
content digests itself.

## Consequences

### Positive

- Fast PRs retain cross-run build reuse for unchanged platform packages.
- Main, nightly, and release verification are independent of derived state.
- No `.tgz` or Verdaccio cache prefix has to be manually invalidated.
- E2E shards consume one immutable bundle produced by a reusable prepare job.
- CI cache storage stops accumulating whole local Buildx directories per key.

### Negative

- Cold authoritative E2E runs are deliberately slower.
- Package packing and Verdaccio publication still run once per producing job.
- Task definitions must accurately list their source inputs; tests now protect
  the cache-key mechanics, but package-specific build inputs remain code.

## Implementation

- `.github/actions/devkit-cas` centralizes the external CAS restore policy.
- Reusable E2E workflows receive `cache-mode`; callers choose the policy rather
  than inferring it from an implementation detail inside a reusable workflow.
- `reusable-e2e-platform-build.yml` creates the immutable build/package/image
  bundle once. Docker and Playwright E2E shards reuse it via
  `prebuilt-artifact`.

### Metrics and stability checks

Every cache change must report these values in the GitHub step summary or the
run evidence dossier:

| Metric | Target / alert |
|---|---|
| Build wall-clock, warm vs cold | Track separately; a warm regression over 20% needs investigation. |
| kb-devkit cache hit ratio | Observe per task; a sudden drop points to an overly broad fingerprint. |
| E2E bundle creation time | Track pack, image build, and Verdaccio publish separately. |
| Cache correctness | Weekly cold build is authoritative; compare its normalized `dist` digest with an optional warm build of the same SHA. Any mismatch fails the cache audit. |
| E2E flake rate | Keep below 2% over a 30-run window; distinguish test flakes from cache mismatches. |

The cold run remains authoritative even if an auxiliary warm-vs-cold comparison
is unavailable. Cache failures must be fixed by correcting the fingerprint, not
by introducing a new manually managed key prefix.

## References

- [ADR-0017: E2E pipeline sharding and incremental caching](./0017-e2e-pipeline-sharding-and-caching.md)
- [CI/CD reference](../ci-cd.md)

---

**Last Updated:** 2026-08-03
**Next Review:** 2026-09-03
