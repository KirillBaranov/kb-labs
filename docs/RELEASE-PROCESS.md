# KB Labs release process

KB Labs has independent SDK, platform and binary streams. A release is only promotable when its immutable artifacts, launcher index and required smoke are all verified; publishing a tag is not itself a stable release.

| Stream | Tag | Publishes | Required order |
| --- | --- | --- | --- |
| SDK | `sdk-vX.Y.Z` | SDK npm tarballs with V2 launcher manifests | first when SDK changes |
| Platform | `platform-vX.Y.Z` | platform, services, adapters and sealed V2 release index | after required SDK candidate |
| Binaries | `vX.Y.Z-binaries` | `kb-create`, `kb-dev`, `kb-devkit`, `kb-deploy`, `kb-monitor` and checksums | when Go tools changed |

## Candidate gates

The tag workflow is the source of release evidence. For a platform candidate it:

1. builds in topological order and stages immutable npm tarballs;
2. emits the V2 package manifests from those actual build outputs;
3. composes the platform topology with the exact SDK artifact already fetched from npm;
4. seals a `kb.create.release-index/v2` and publishes the tarballs;
5. downloads the public npm bytes again and verifies every recorded SHA-256;
6. runs a clean `kb-create apply` against the canary index and asserts that `kb.config.jsonc` and `devservices.yaml` are rendered.

The candidate smoke is deliberately a bounded installer/package/config gate. Actual service startup remains covered by the sharded integration suites; a green smoke does not replace them.

## Promotion checklist

1. Confirm the SDK candidate is published if the platform index references a new SDK version.
2. Confirm the platform candidate's stage, npm delivery, index binding and launcher smoke are successful. Do not promote a failed, pending or skipped required check.
3. Run the promotion workflow for the candidate tag.
4. Confirm it attaches `release-index.json` to the platform GitHub Release.
5. Confirm the `installer-stable` release's `channel.json` points to that index URL and its SHA-256.
6. Perform the stable clean-install acceptance run using the released binary and stable index pointer; retain its log/dossier with the release evidence.

The stable pointer is mutable convenience metadata. The fetched index remains immutable and hash-verified by the consumer.

## Failure handling

- **Index sealing fails:** a selected package is missing a valid V2 manifest or the manifest contradicts the platform topology. Fix the package contract; do not hand-edit the index.
- **Registry binding fails:** npm did not serve the tarball bytes staged for the candidate. Treat this as a delivery failure, not a retryable installer warning.
- **Launcher smoke fails:** inspect its `.kb/logs/` and diagnostic dossier. Fix the resolver, manifest or generated config; do not relax the smoke.
- **A service suite fails:** use the owning E2E shard and its scenario report. Do not make the candidate smoke start every service to mask shard ownership.
- **Stable install fails:** freeze promotion, retain the immutable index and dossier, then repair and publish a new candidate. Never overwrite a released index.

Local preparation (`pnpm release:sdk:prepare` or `pnpm release:platform:prepare`) prepares version/changelog/tag state. npm delivery and index verification happen only in GitHub Actions.
