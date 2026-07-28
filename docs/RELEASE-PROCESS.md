# KB Labs release process

KB Labs is released through three independent streams. They share the
repository and version family, but they do not publish the same artifacts.

| Stream | Tag | Artifacts | Entry point |
| --- | --- | --- | --- |
| SDK | `sdk-vX.Y.Z` | SDK packages and their dependencies to npm | `.github/workflows/publish-npm-on-tag.yml` |
| Platform | `platform-vX.Y.Z` | Platform packages and adapters to npm | `.github/workflows/publish-npm-on-tag.yml` |
| Binaries | `vX.Y.Z-binaries` | Go tools (`kb-create`, `kb-dev`, `kb-devkit`, `kb-deploy`, `kb-monitor`) plus checksums to GitHub Releases | `.github/workflows/release-binaries.yml` |

## SDK and platform releases

The release manager prepares a lockstep package release, commits the version
and changelogs, and creates the stream tag. The tag workflow then:

1. validates that the tag points to a commit reachable from `main`;
2. builds packages in topological order;
3. stages immutable npm tarballs;
4. publishes those tarballs to npm and verifies them against the registry;
5. creates the GitHub Release;
6. runs the post-publish `kb-create` smoke test.

The local preparation commands are:

```bash
pnpm release:sdk:prepare       # SDK stream
pnpm release:platform:prepare  # Platform stream
```

These commands build and validate the workspace, update package versions and
changelogs, and create the corresponding tag. npm delivery is performed by
GitHub Actions after the tag is pushed; credentials are not needed locally.

The two npm streams are intentionally separate. A platform release is not a
binary release and must not be used as the source of Go binary assets.

## Binary releases

The binary workflow is triggered by a tag ending in `-binaries`, for example
`v2.111.0-binaries`. GoReleaser publishes OS/architecture-specific files and
`checksums.txt` to that GitHub Release. The `kb-create` installer resolves the
newest release with the `-binaries` suffix, downloads the matching asset, and
verifies its SHA-256 checksum before installing it.

This suffix is part of the runtime contract. Do not resolve installer binaries
through GitHub's generic `/releases/latest` endpoint: the latest release may be
a package-only `sdk-*` or `platform-*` release with no binary assets.

## Recommended order

For a complete versioned rollout:

1. publish the SDK stream when SDK packages changed;
2. publish the platform stream when platform packages changed;
3. publish the `-binaries` stream when Go tools changed or when the platform
   manifest expects new binary versions;
4. wait for the npm delivery and post-publish smoke checks for the relevant
   stream.

The binary stream can be published independently. Its tag must remain a
`-binaries` tag so installers and self-update logic continue to select it
correctly.

## Troubleshooting a release

- npm packages missing: inspect the `Stage` and `Deliver to npm` jobs in the
  tag workflow.
- `kb-create` cannot install `kb-dev`: inspect the latest `*-binaries` GitHub
  Release and confirm it contains the platform asset and `checksums.txt`.
- post-publish smoke fails after npm delivery: inspect the `kb-create` e2e log;
  npm publication may already be complete even when the final smoke job fails.
