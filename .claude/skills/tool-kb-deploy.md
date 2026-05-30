---
name: tool-kb-deploy
description: kb-deploy — declarative platform deploy (apply, ADR-0014) + legacy Docker site deploy (run)
globs:
  - "tools/kb-deploy/**"
  - ".kb/deploy/**"
  - ".github/workflows/deploy-platform.yml"
  - "sites/**"
---

# kb-deploy — Deploy Tool

`kb-deploy` has **two independent modes**:

| Mode | Command | What it deploys | Manifest |
|---|---|---|---|
| **Declarative platform** (ADR-0014) | `kb-deploy apply` | The KB Labs platform itself (gateway/rest/workflow/state daemons) onto VMs over SSH | `.kb/deploy/deploy.yaml` + `.kb/deploy/kb.config.jsonc` |
| **Legacy Docker** | `kb-deploy run` | Sites/services as Docker images to a remote host | `kb-deploy` target config |

Binary: `tools/kb-deploy/kb-deploy`. Build: `make -C tools/kb-deploy build`.

---

## Mode 1 — Declarative platform deploy (`apply`)

Dogfoods the same path users take: build → publish `@kb-labs/*` to a private
Verdaccio on the VM → `kb-deploy apply` installs + swaps + restarts the daemons
over SSH, gated on health probes, with config delivery and auto-rollback.

**Always deploy via CI, never by hand.** The pipeline lives in
`.github/workflows/deploy-platform.yml` (`workflow_dispatch`). Manual scp/ssh
mutation of the VM is out of bounds — codify everything in the workflow.

### How to deploy

```bash
# Dry-run first (default) — computes the plan, mutates nothing.
gh workflow run deploy-platform.yml --ref main -f dry_run=true

# Real deploy.
gh workflow run deploy-platform.yml --ref main -f dry_run=false

# One-shot recovery: wipe stale installed state, then install fresh.
gh workflow run deploy-platform.yml --ref main -f dry_run=false -f reset_platform=true

# Watch it (don't poll in tight loops — watch in background).
gh run list  --workflow=deploy-platform.yml --limit 1
gh run watch <run-id> --interval 30 --exit-status
```

`workflow_dispatch` requires the workflow file to be on the **default branch**,
so changes to `deploy-platform.yml` must be merged to `main` before they can run.

### Inputs

- `dry_run` (default **true**) — safety. Plan only. Flip to `false` to mutate.
- `reset_platform` (default false) — wipe `releases/`, `services/`,
  `releases.json`, `.kb/devservices.yaml` before apply. Only needed to clear
  state left by an earlier broken build (see gotcha #2). Normal deploys: false.
- `version` (default `2.94.0`) — platform package version to deploy.

### What `apply` does (engine)

1. **Preflight (control machine, before any SSH):** load `deploy.yaml`, parse
   `kb.config.jsonc` as JSONC, `validateSecrets` (all `${secrets.X}` resolve,
   empty = error), render per-host `.env`, compute config hash.
2. **deliverConfigs pre-pass:** atomically write `kb.config.jsonc` + `.env` to
   each host (`mkdir → cp .prev → write .tmp umask 077 → test -s → mv`). Abort +
   restore on any host failure before touching releases.
3. **Waves:** per service → `kb-create install-service` → `kb-create swap` →
   `kb-dev restart <id>` + `kb-dev ready <id> --timeout <healthGate>`.
4. **Health gate fails → auto-rollback:** restore config to `.prev`, swap back to
   the previous release, restart. Lock is written only on full success.

### Config split (keep it!)

- `deploy.yaml` = **WHERE/HOW** — hosts, versions, adapters, rollout waves,
  per-host env (`${secrets.X}`). Never put adapterOptions here.
- `kb.config.jsonc` = **WHAT** — adapter wiring + runtime options, delivered
  verbatim. `${VAR}` resolved at daemon start from the host `.env`.
- `platform.dir` is intentionally **omitted** from the delivered config: each
  daemon runs from `services/<short>/current` and resolves adapters from its own
  release `node_modules`.

### Verdaccio (package source)

`@kb-labs/*` are served from a **private Verdaccio on the VM** (`127.0.0.1:4873`),
decoupling deploy from public npm. The workflow bootstraps it with a mounted
config (htpasswd under the writable storage volume), authenticates publishes via
HTTP Basic, and uses **ephemeral storage** (no named volume) so every run serves
the freshly-built tarballs.

---

## ⚠️ Operational gotchas (hard-won — remember these)

1. **Service packages MUST ship `dist/manifest.json`.** `kb-create swap` reads it
   to register the service in `devservices.yaml`; if absent it **silently skips**
   and kb-dev can't start anything. The shared tsup node preset
   (`infra/devkit/tsup/node.js`) now emits it automatically for `kb.service/*`
   manifests — so a normal `pnpm build` is enough. If you write a new service,
   confirm `dist/manifest.json` exists after build.

2. **Release ids are spec-derived** (`pkg + version + adapters/plugins`), **not
   content-derived.** `install-service` NoOps on an existing release dir. So:
   **changing package content without bumping the version will NOT redeploy** —
   the old release dir stays. In a real release you bump the version → new id →
   reinstall. To force a clean install of the *same* version (e.g. recovering
   from a bad build), use `reset_platform=true`.

3. **kb-dev keys services by `manifest.id`, not the package short name.**
   `@kb-labs/core-state-daemon` installs under `services/core-state-daemon/` but
   its manifest id is `state-daemon`. kb-deploy reads the id from the release
   manifest and restarts by it (don't reintroduce short-name restarts).

4. **dry_run defaults to true.** A run that "did nothing" on the VM but reported
   success usually means it was a dry-run, or apply skipped (release already
   current — see #2).

---

## Troubleshooting a failed deploy

The workflow has a **`Diagnose daemons`** step (`if: failure()`) that dumps
`kb-dev status`, per-service logs, listening ports, release symlinks and the
delivered config. Read it first:

```bash
gh run view <run-id> --log | grep -a 'Diagnose'   # daemon logs / ports
gh run view <run-id> --log | grep -a 'apply'       # per-action failures
```

`kb-deploy apply` prints each failed action with its underlying error (install /
swap / health-gate, including the remote command output).

Common signatures:
- `config not found: .../devservices.yaml` → service never registered → missing
  `dist/manifest.json` (gotcha #1) or stale release (gotcha #2 → reset_platform).
- `unknown service or group` on restart → name mismatch (gotcha #3).
- `ENEEDAUTH` / `409` on publish → Verdaccio auth/state (the workflow handles
  both; check the Publish step log).

---

## Mode 2 — Legacy Docker site deploy (`run`)

Builds Docker images and deploys configured targets to the remote host. Used for
`sites/**`.

```bash
kb-deploy list             # list configured deploy targets
kb-deploy status           # last deployed SHA per target
kb-deploy run              # deploy affected targets (git diff HEAD~1)
kb-deploy run --all        # deploy all targets
kb-deploy run <target>     # deploy a specific target by name
```

- Always `list` first to confirm targets before deploying.
- `status` after deploy to verify the new SHA landed.
- `run` without flags deploys only affected targets based on `git diff HEAD~1`.

---

## Git / safety

- Never `git push` or mutate the VM without explicit permission.
- Never modify ports in `devservices.yaml` — fix the scripts.
- Secrets: stream via stdin / env, never argv or logs; never persist resolved
  values to disk or the lock.
