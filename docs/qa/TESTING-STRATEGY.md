# QA and E2E strategy

The release test pyramid separates deterministic launcher correctness from
network and service behaviour. A broad end-to-end job must not be the only
place that tells us a package manifest or generated configuration is wrong.

## Ownership by shard

| Shard | Owns | Evidence | Network |
| --- | --- | --- | --- |
| launcher resolver | compatibility, pins, providers, topology and exact plan | `tools/kb-create/v2/{catalog,resolve}` tests | none |
| launcher render/verify | `kb.config.jsonc`, `devservices.yaml`, ports and graph equality | `v2/render`, `v2/verify` tests | none |
| launcher lifecycle | apply/update/uninstall/rollback, receipt and snapshot recovery | `v2/runtime`, `v2/lifecycle`, `v2/journey` tests | none/offline fixtures |
| manifest/doctor | package requirements, missing values, safe repair and redaction | `v2/installed`, `v2/doctor` tests | none |
| release smoke | exact public candidate tarballs and config render | platform tag workflow `launcher-smoke` | npm only |
| service E2E | startup, readiness and cross-service behaviour | `e2e/<domain>/scenarios/*` | isolated Docker/resources |
| product E2E | domain UI/API/workflow behaviour | owning Playwright shard | isolated Docker/resources |

Each shard owns its roots, ports, artifact namespace and cleanup. The E2E
selector chooses affected zones from the PR diff; changes to global E2E/CI or
launcher topology fail safe to the broader set. A flaky test is repaired in
the shard that owns its mutable resource, not by increasing a global timeout.

## Required release evidence

1. `make e2e` and `go test -race -count=1 ./...` from `tools/kb-create` pass
   for launcher changes.
2. Manifest emission, index sealing and index-byte binding pass for a platform
   candidate.
3. The candidate clean-install smoke applies the published canary index and
   confirms generated config/service graph files.
4. Affected service/product E2E shards pass; failures retain their scenario
   summaries and diagnostics.
5. Stable promotion is followed by one clean install through the released
   binary and stable pointer.

## Manual scenarios

`docs/qa/scenarios/` records user-facing acceptance cases. A scenario marked
`e2e-done` names the automated evidence; it is still valuable for exploratory
release checks, but must not claim an old command/path the current launcher
does not implement. Record a manual run in `docs/qa/runs/YYYY-MM-DD.md` with:

- release tag and immutable release-index digest;
- platform root and selected profile (never secrets);
- commands/results, `logPath`, and diagnostic dossier path on failure;
- a linked issue and the owning regression test/shard for every defect.

## Local commands

```bash
# Launcher contracts and offline journeys.
cd tools/kb-create
go test -race -count=1 ./...

# Workspace build in dependency order.
pnpm build

# Repository E2E entry point.
make e2e
```

Use a real npm candidate only for release smoke. Local package fixtures are
the default for launcher regression because they are faster, deterministic and
make failure diagnosis reproducible.
