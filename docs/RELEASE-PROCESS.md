# KB Labs release process

KB Labs has independent SDK, platform and binary streams. A release is only promotable when its immutable artifacts, launcher index and required smoke are all verified; publishing a tag is not itself a stable release.

| Stream | Tag | Publishes | Required order |
| --- | --- | --- | --- |
| SDK | `sdk-vX.Y.Z` | SDK npm tarballs with V2 launcher manifests | first when SDK changes |
| Platform | `platform-vX.Y.Z` | platform, services, adapters and sealed V2 release index | after required SDK candidate |
| Binaries | `vX.Y.Z-binaries` | `kb-create`, `kb-dev`, `kb-devkit`, `kb-deploy`, `kb-monitor` and checksums | when Go tools changed |

## Candidate gates

The prepare workflow creates the immutable release metadata before the tag. The tag workflow is then the delivery/evidence boundary. For a platform candidate the combined process:

1. the prepare workflow builds in topological order and stages immutable npm tarballs;
2. its `Prepare release index` step reads those exact tarballs and package manifests;
3. it seals `.kb/release/release-index.json` into the release commit/tag;
4. the tag workflow verifies and attaches that prepared index while delivering the tarballs;
5. it verifies the exact Platform/SDK compatibility marker from the prepared index;
6. it downloads the public npm bytes again and verifies every recorded SHA-256;
7. it runs a clean `kb-create apply` against the canary index and asserts that `kb.config.jsonc` and `devservices.yaml` are rendered;
8. it runs the required post-publish workflow/plugin smoke against the public canary packages.

For a binary candidate, `release-binaries.yml` first publishes the immutable
GoReleaser assets and `binaries-canary`, then downloads that exact published
`kb-create-linux-amd64` asset, verifies its checksum, and runs the same V2
install/update/plugin/workflow smoke against a public platform release index.
`promote-binaries.yml` requires the successful binary post-publish smoke run
before moving the candidate to `binaries-stable`.

The candidate smoke is deliberately a bounded installer/package/config/workflow gate. Actual service startup remains covered by the sharded integration suites; a green smoke does not replace them.

The compatibility marker is conservative in the first release: it records the
exact staged Platform/SDK pair and the SDK's declared runtime peer range. A
broader compatibility range must be earned by additional release evidence; it
is never inferred from a shared `2.x` or `3.x` major.

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

Local preparation (`pnpm release:sdk:prepare` or `pnpm release:platform:prepare`) prepares version/changelog/tag state and, for platform releases, the sealed index. npm delivery and public-byte verification happen only in GitHub Actions.
