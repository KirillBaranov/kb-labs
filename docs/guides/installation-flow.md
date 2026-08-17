# KB Labs launcher lifecycle

`kb-create` has one V2 contract. It does not retain the former imperative installer, its `install` command, package scan, or compatibility state.

The launcher always receives a sealed `kb.create.release-index/v2` plus an `InstallRequest`; it resolves a deterministic plan before changing either the filesystem or npm state. The same request shape is used by a person, CI, an agent and a built-in scenario.

## Inputs and ownership

| Input | Owner | Purpose |
| --- | --- | --- |
| `release-index.json` | release workflow | exact npm artifacts, digests, compatibility and service graph for one channel candidate |
| `InstallRequest` | user / CI / wizard / scenario | platform and SDK selector, service profile, plugins, adapters, roots and policy |
| component manifests | published packages | config requirements, capability providers and service metadata |
| receipt and snapshots | launcher | verified installed state used by update, doctor and rollback |

The release index is immutable and digest-checked. The launcher never guesses a package version from a tag or from whatever happens to be in `node_modules`. Services are part of the selected platform bundle; plugins and adapters may be separately selected and pinned when their declared compatibility allows it.

## Normal paths

For a human, the wizard returns a request; it does not install a different way:

```bash
kb-create wizard \
  --index release-index.json \
  --request-platform-root /srv/kb-platform > request.json

kb-create plan  --index release-index.json --input request.json
kb-create apply --index release-index.json --input request.json
```

CI and agents may avoid a request file, but use the identical resolver:

```bash
kb-create apply \
  --index release-index.json \
  --request-platform-root /srv/kb-platform \
  --platform-channel stable \
  --service-profile default \
  --policy strict \
  --plugins release@1.2.3 \
  --adapters openai@1.2.3
```

Use `--platform-version` or `--sdk-version` for an exact pin. Valid platform channels are `stable`, `canary` and `experimental`. `--offline` chooses the pre-provisioned artifact source; it does not silently fall back to the network.

`--platform-root` is retained for recovery operations. `--request-platform-root` is the root for plan/apply/update requests. `--secret-env requirement.id=ENV` passes only an environment-variable reference: the value is never written to the request, receipt, output, diagnostic bundle or telemetry.

## What apply guarantees

1. Validate compatibility, provider bindings, ports and service dependencies.
2. Install the exact verified artifacts in one package-manager transaction.
3. Render `.kb/kb.config.jsonc` and `.kb/devservices.yaml` atomically from the resolved plan and package manifests.
4. Verify `resolved service graph = rendered devservices = kb-dev status`.
5. Persist a receipt only after verification succeeds.

An incompatible version, missing provider, missing required configuration, or invalid graph fails before a successful installation is reported. Every result is a JSON envelope with a stable error code, message and remediation hint.

## Update, recovery and diagnostics

```bash
# Resolve and apply a new desired request; a snapshot precedes mutation.
kb-create update --index release-index.json --input request.json

# Inspect configuration gaps from the selected package manifests.
kb-create doctor --platform-root /srv/kb-platform

# Apply only manifest-declared safe defaults; missing secrets remain input.
kb-create doctor --fix --platform-root /srv/kb-platform

# Recover a named immutable snapshot, or remove launcher-owned state.
kb-create rollback --platform-root /srv/kb-platform --snapshot SNAPSHOT_ID
kb-create uninstall --platform-root /srv/kb-platform
```

`doctor --fix` never invents a secret or chooses between ambiguous providers. It records missing user input with the manifest owner and hint. Each mutating operation writes the private package-manager transcript to `.kb/logs/`; on failure it also writes a redacted dossier in `.kb/diagnostics/` and prints both paths. Opt-in telemetry carries only outcome metadata, never paths, secrets or logs.

## Release hand-off

The platform publish workflow emits and seals the index from the exact staged package tarballs, then binds each artifact to the bytes fetched from npm. Candidate smoke performs a clean V2 apply from those public candidate URLs. Promotion attaches the verified index to the platform GitHub Release and updates the stable channel pointer only after the candidate gates are green.

The SDK stream is released first when it changes: the platform index records the exact already-published SDK artifact rather than re-publishing it. See [the release process](../RELEASE-PROCESS.md) for the operational checklist.
