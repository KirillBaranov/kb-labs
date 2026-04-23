# ADR-0014: Declarative Delivery and Fleet Distribution

**Date:** 2026-04-22
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-22
**Tags:** delivery, deployment, architecture, distribution

> **References:** [ADR-0012 — Platform / Project Scope](./0012-platform-project-scope.md), [ADR-0013 — Installer Config Placement](./0013-installer-config-placement.md)

---

## Context

KB Labs distributes as a set of npm packages (`@kb-labs/*`) installed by `kb-create` into a dedicated `~/kb-platform/` directory. This works well for a single developer on a single machine. It does **not** work for team/cloud scenarios, which is now the primary pain point of the platform:

- **Services are not self-contained.** `gateway` will not start without its adapters (llm, cache, logging, ...) and a hand-written `kb.config.prod.json`. The same is true for `rest-api`, `workflow`, `marketplace`. Every deploy requires manually wiring dependencies.
- **No fleet synchronization.** When a plugin or adapter is updated, there is no mechanism to roll that change out to multiple installations atomically, with health gates or rollback.
- **No declarative surface for CI/CD.** `kb-deploy` exists as a Go CLI (`tools/kb-deploy/`) but its current `run` subcommand is imperative (build → push → ssh → docker compose). It cannot express *"service gateway@1.2.3 with these adapter versions, on these hosts, in this rollout strategy"*.
- **No versioning separation between product code and deployment configuration.** Today, a config change for a deployed service lives in the same repo as the service code, which couples release cadences that should be independent.
- **Enterprise cases are unaddressed.** Air-gapped installs, private registries, regulated audit trails, intermittent connectivity during rollout — all require primitives the platform does not expose.

The constraint that shapes the solution: **users install the platform via `kb-create` in production mode** (platform in `~/kb-platform/`, project holds only `.kb/kb.config.jsonc` + artifacts). All `@kb-labs/*` packages are already published to npm. The delivery problem is therefore not about building images from source — it is about **declaratively pinning, distributing, and atomically switching versions across a fleet**.

### Alternatives considered

1. **Hermetic service bundles** — build each service into a self-contained tarball including all adapters. Rejected: duplicates work already done by npm, creates a new artifact format to maintain, does not match how users actually consume the platform (via `kb-create`).
2. **Docker-first** — treat every service as a container, use standard k8s / compose tooling. Rejected as the *primary* mechanism: does not solve the adapter-wiring problem (containers still need configured adapters inside), and forces container infrastructure on users who do not need it. Retained as a *backend* for stateful infra (see existing `tools/kb-deploy/run`).
3. **Centralized control plane service** — a long-running orchestrator that pushes updates to agents on each host. Rejected: introduces a service that itself must be operated, stateful, and available. GitOps (git repo as source of truth + idempotent pull/apply) gives the same guarantees with no additional operational surface.

## Decision

Introduce a **declarative delivery plane** on top of existing tools, with clear role boundaries and a GitOps-style workflow.

### Tool boundaries

| Tool | Scope | Responsibility |
|------|-------|----------------|
| `kb-create` | one host | Install / update / swap / rollback platform and individual services. Owns `~/kb-platform/`. |
| `kb-dev` | one host | Service lifecycle (start/stop/restart/health). Unchanged. |
| `kb-deploy` | many hosts | Orchestrate `kb-create` + `kb-dev` across a fleet via SSH. Owns `deploy.yaml` and `deploy.lock.json`. |
| `kb-devkit` | build-time | Build artifacts for the platform itself. Not involved in user deployment. |

`kb-deploy apply` is the only entry point for fleet operations. It delegates per-host actions to `kb-create` and `kb-dev` over SSH.

### Adapter requirements live in `deploy.yaml`, not in service manifests

Service manifests (in published npm packages) do **not** carry an `adapters` requirement list. The service code itself already expresses what it needs — every `platform.llm.complete(...)` or `platform.cache.get(...)` is a de-facto declaration. Duplicating the same information in the manifest would only introduce drift: a new `platform.X` call could be added without updating the manifest, leaving pre-flight validation green while runtime fails.

The "did the admin wire up everything?" check is handled where it belongs:

- `kb-deploy plan` validates that every package named in `deploy.yaml` exists and is semver-resolvable — that is its job.
- Runtime: when a service asks for an unregistered adapter role, it refuses to start with a specific error naming the role.
- `kb-deploy apply` health gate catches the failure and auto-rollbacks the affected wave.

This keeps published service packages fully decoupled from any specific adapter implementation (OpenAI vs Anthropic, Redis vs in-memory) — which was the purpose of introducing adapters in the first place. Each published service ships an `examples/deploy.yaml` illustrating a known-working adapter combination; this is a living example, not a schema constraint.

### Atomic releases on target

`kb-create install-service` installs into a versioned directory and does **not** disturb the running release:

```
~/kb-platform/
├── releases/
│   ├── gateway-1.2.3-<hash>/
│   │   ├── node_modules/
│   │   ├── release.json        # service, adapters, plugins, integrity
│   │   └── .incomplete         # marker removed on success
│   └── gateway-1.2.2-<hash>/
├── services/
│   └── gateway/
│       ├── current  → ../../releases/gateway-1.2.3-<hash>/   (symlink)
│       └── previous → ../../releases/gateway-1.2.2-<hash>/   (symlink)
└── releases.json                # host-local state of truth
```

`kb-create swap <service> <release-id>` performs an atomic `mv current.new current` rename. `kb-create rollback <service>` swaps to `previous`. `kb-dev restart <service>` picks up the new path. Old releases are garbage-collected per `--keep-releases N` (default 3).

### Scope boundary: deploy artifacts live in projectDir by default

ADR-0012 established two config scopes: **platformDir** (installer-owned) and **projectDir** (user-owned). Declarative delivery artifacts (`deploy.yaml`, `deploy.lock.json`, rendered config templates, secrets refs) live in **projectDir**, under `<workspace>/.kb/deploy/`.

| Scope | Location | Owner | Contents |
|-------|----------|-------|----------|
| **platform** | `~/kb-platform/` (target and dev machine) | `kb-create` | Installed code, releases, runtime state |
| **project** | `<workspace>/.kb/` | user | `kb.config.jsonc` pointer, profile artifacts, workflows, **`deploy/` subtree** |
| **deploy-repo** *(optional escape hatch)* | separate git repo | DevOps team | Same `deploy.yaml` / `lock` / `configs/` structure, extracted when separation of duties is required |

Rationale for project-scope as the default:

- One git lifecycle for code, config, and deploy manifest. A config change and the corresponding `deploy.yaml` bump ship as a single PR.
- `git blame` on `deploy.yaml` aligns with the code history it describes.
- Solo and small-team setups start with no additional infrastructure — no second repo to create, secure, and wire into CI.
- Mental model consistency: `.kb/` is already "everything about this project." Deploy fits there.
- Matches the platform/project split by responsibility: platform defaults install cheaply from CI via `kb-create install --version`; the project repo pins the tested combination of service versions, adapter versions, and configs.

The **optional deploy-repo** escape hatch exists for: (a) a DevOps team operating many product repos under one deploy pipeline, (b) compliance separation where developers must not have access to production secret history, (c) one fleet serving multiple products. The `deploy.yaml` schema is identical in both placements; promoting `.kb/deploy/` to a standalone repo is a `git mv`.

### Rendered configs are part of the release

On target hosts, rendered service configs live **inside** `releases/<id>/config/`, not in projectDir. Consequences:

- Swap is atomic across code **and** config — a rollback reverts both together.
- Production hosts do not need a projectDir at all — they are pure executors. `kb-create install-service` populates everything required under platformDir.
- The config template in the deploy repo is the single editable surface; the rendered artifact on target is immutable and versioned with its release.

### `deploy.yaml` — declarative fleet manifest

A new top-level document, coexisting with the existing infrastructure/targets sections:

```yaml
platform:
  version: "1.5.0"
  registry: https://registry.npmjs.org   # or private

services:
  gateway:
    service: "@kb-labs/gateway"
    version: "1.2.3"
    requires:
      adapters:
        llm: "@kb-labs/adapters-openai@0.4.1"
        cache: "@kb-labs/adapters-redis@0.2.0"
    config: ./configs/gateway.jsonc
    env:
      OPENAI_KEY: ${secrets.OPENAI_KEY}
    targets:
      hosts: [prod-1, prod-2, prod-3]
      strategy: canary
      waves: [1, 50, 100]
      healthGate: 30s

hosts:
  prod-1:
    ssh: { user: deploy, host: 1.2.3.4, keyEnv: DEPLOY_KEY }
    platformPath: /opt/kb-platform

rollout:
  autoRollback: true
  parallel: 3
```

This manifest lives in the project repo under `.kb/deploy/deploy.yaml` by default. A separate deploy repo is an optional refactor for teams that need to decouple deploy cadence from product code (see "Scope boundary" above).

### Safety guards

Six small, non-optional guards harden the design against common operational failure modes:

- **Schema versioning.** `deploy.yaml` carries a mandatory `schema: kb.deploy/1`. `kb-deploy` fails fast on major mismatch.
- **Lock is authoritative.** `apply` reads versions exclusively from `deploy.lock.json`. Semver ranges resolve only via explicit `kb-deploy upgrade`. Prevents "a minor bump broke prod overnight."
- **Config drift detection.** `deploy.lock.json.services.<id>.configHash` records SHA-256 of the rendered config; `plan` compares with target state. Manual edits on host surface as drift.
- **GC protects rollback window.** `keepReleases` default 5, `current` and `previous` always protected. Deeper rollback via git history of the lock file (`kb-deploy rollback --to <git-sha>`).
- **Cross-filesystem guard.** `kb-create install-service` verifies `releases/` and `services/` share a filesystem before installing — prevents `EXDEV` on non-atomic rename when Docker volumes are misconfigured.
- **`autoCommit` mode warns loudly.** Default is `artifact`; `autoCommit` requires branch protection on the deploy repo, documented and surfaced via `kb-deploy` warning.

`kb-dev` commits to a **manifest compatibility contract**: read schema versions N and N-1; breaking changes require one-minor-release deprecation. Enforced by tests, not runtime.

### `deploy.lock.json` — resolved, auditable, committed

Produced by `kb-deploy apply`, committed back to the deploy repo:

```json
{
  "schema": "kb.deploy.lock/1",
  "platform": { "version": "1.5.0" },
  "services": {
    "gateway": {
      "resolved": "@kb-labs/gateway@1.2.3",
      "integrity": "sha256-...",
      "adapters": { "llm": { "resolved": "...", "integrity": "..." } },
      "appliedTo": { "prod-1": { "releaseId": "...", "appliedAt": "..." } }
    }
  }
}
```

Git history of the lock file is the full audit trail. No external state store required.

### Target runtime contract

Four primitives define what `kb-deploy` assumes on a target host. Three are already implemented by existing tools; one is new for production use.

**Health checks — via `kb-dev`.** After swap + restart, `kb-deploy` invokes `kb-dev ready <service> --timeout <healthGate> --output json` over SSH. The probe runs locally on the target using the existing HTTP/TCP/Command probe classification in `kb-dev/internal/health/`. Consequence: health ports need not be reachable from the control machine, which removes topology assumptions about CI networking.

**Bootstrap — `kb-create` shipped over SSH.** `kb-deploy` delivers the `kb-create` binary to targets via `scp`, not via `curl | sh`. The version is pinned in `deploy.yaml` under `bootstrap.kbCreateVersion` and recorded in `deploy.lock.json`. The existing `install.sh` remains the recommended path for developer machines but is not used for production rollout. This makes airgap and private-network targets a flat case of the same flow.

**Secrets — never on persistent disk, delivered via tmpfs.** Secrets never enter `deploy.lock.json`, `config/*.jsonc`, git, or any persistent file on target. Three layers:

1. `deploy.yaml` contains only references (`${secrets.X}`), never values. A top-level `secretBackend:` declares the resolution source (`github-actions`, `env`, `vault`, `aws-sm`, `gcp-sm`).
2. Resolution happens on the control machine (CI runner via GitHub Secrets / OIDC / IAM role, or developer's process env for local work). Resolved values are streamed to the target over SSH, never committed to any file on the control machine either.
3. On target, `kb-deploy` writes values to `/dev/shm/kb-platform/secrets/<service>.env` (tmpfs in RAM), mode `0600`, owner `kb`. `kb-dev` reads this path at spawn and on watchdog restart. After a host reboot, tmpfs is empty — an explicit `kb-deploy apply` re-hydrates secrets. This trade-off is accepted in MVP; follow-up adds optional backend self-pull via OIDC so reboot recovery is automatic.

Consequence: disk backups, swap files, coredumps, and stolen drives never leak secrets. Rendered configs contain only placeholders, expanded at runtime from environment.

**Dedicated non-root user, optional OS supervisor.** Services run as a non-root `kb` user (configurable per host). `~/kb-platform/` is owned by this user with mode `0750`. `kb-dev` uses its existing `Setpgid` + PID-file + watchdog stack for service lifecycle. For production, `deploy.yaml` may opt into a `supervisor: systemd` mode, which causes `kb-create` to emit a `kb-dev.service` unit file with `Restart=always`. The watchdog inside `kb-dev` handles service-level failures; systemd handles `kb-dev`-level failures. launchd is not a target platform for production.

### `kb-deploy apply` — orchestration algorithm

1. Load `deploy.yaml`, resolve secrets, validate that named packages exist and are semver-resolvable.
2. Load previous `deploy.lock.json`.
3. For each host: SSH, read `~/kb-platform/releases.json`, diff against desired state.
4. Compute action plan: `(host, service, action)` where action ∈ `{install, swap, restart, skip, rollback}`.
5. Execute by waves (canary default): within each wave, run hosts in parallel up to `rollout.parallel`; between waves, enforce `healthGate`.
6. On any host failure within a wave: if `rollout.autoRollback`, rollback all hosts in that wave (symlink swap + restart). The wave is transactional.
7. On success: update `deploy.lock.json` and emit a JSON summary.

### Snapshot as a universal source abstraction

Three possible sources of package tarballs, all reduced to one downstream path:

| Source | How `kb-deploy` obtains packages |
|--------|-----------------------------------|
| `registry` (default) | `kb-create install-service` pulls from configured registry (public or private) |
| `workspace` | `kb-deploy pack --from-workspace` runs `pnpm pack` over local `@kb-labs/*`, produces `snapshot.tar` |
| `snapshot` | `kb-deploy apply --from-snapshot snapshot.tar` unpacks into a host-local offline store, `kb-create install-service` installs from there |

Air-gapped deployment uses the same snapshot mechanism as workspace iteration — physically transfer the tarball, apply offline. No separate airgap code path.

### Secrets

Syntax `${secrets.X}` and `${env.X}`. Resolution order for `secrets.X`: process env → `.env` file → error on plan. Resolved values are never written to `deploy.lock.json`. On target, secrets reach the service via `kb-dev` env injection. Missing secrets fail `kb-deploy plan`, not runtime.

### CI/CD contract

`kb-deploy` is CI-compatible by default, human-friendly on TTY:

- Non-interactive; `--output json` for structured CI consumption.
- Exit codes: `0` no changes, `1` applied, `2` error, `3` rollback fired.
- Idempotent `apply` — safe to retry.
- `kb-deploy plan` produces a PR-reviewable diff; recommended as a required status check before apply.
- Reusable GitHub Actions workflow shipped with the platform as the canonical integration.

### Marketplace role change

The marketplace plugin is no longer the installer. Its role shifts to:

| Function | Status |
|----------|--------|
| Installer (pulls packages, writes `marketplace.lock`) | **Removed.** Replaced by `kb-create install-service` and `deploy.lock.json`. |
| Catalog / discovery (browse available entities, versions, changelog) | **Retained — primary role.** |
| Runtime enable/disable of already-installed plugins | **Retained.** Soft toggle, does not change installed versions. |
| UI "install / remove in production" | **Changes semantics.** In production mode (project has a linked deploy repo), these actions generate a pull request against the deploy repo rather than mutating runtime state directly. In dev mode (no deploy repo), the current direct-install behavior is retained. |

This follows the GitOps principle: production state is controlled via reviewable, reversible commits; non-production local workflows retain frictionless direct mutation.

## Consequences

### Positive

- Deploying `gateway` (or any service) becomes a single command: `kb-deploy apply deploy.yaml`. The adapter-wiring problem disappears — services self-describe, `deploy.yaml` pins versions, validation is automatic.
- Rollback is atomic and one-command (`kb-create rollback <service>` or `kb-deploy rollback`). No manual cleanup, no downtime window.
- Multi-host fleets are first-class: canary, waves, health gates, auto-rollback with zero additional infrastructure.
- Platform, product, and deployment concerns version independently. A plugin bump is a PR in the deploy repo; it does not touch product code.
- Full audit trail lives in git (`deploy.lock.json` history). No external audit system required.
- Air-gap, private registry, and intermittent-network scenarios share one primitive (snapshot). No separate enterprise code path.
- CI/CD integration is native, not bolted on.
- Soloist workflow is preserved end-to-end — `kb-deploy apply --from-workspace` from a workstation to a personal staging VPS works identically to a client admin running CI-driven production deploys.

### Negative

- `kb-create` grows new surface area (`install-service`, `swap`, `rollback`, `releases`). Requires careful backward compatibility with existing single-machine installs.
- Each release takes disk space (one `node_modules` per pinned version × N retained releases). MVP accepts the overhead; later optimizations via pnpm content-addressable store with hardlinks are possible.
- The marketplace UI's "install in production" becomes a PR-generator rather than a direct action. This is a behavioral change for existing users and must be clearly communicated. The dev-mode escape hatch mitigates the friction for local workflows.
- A deploy repo is an additional artifact for teams to operate. The alternative (no deploy repo) is available only for dev-mode solo users; any team use case requires this separation.
- The existing `tools/kb-deploy/run` (imperative SSH+compose) remains for stateful infrastructure but is no longer the primary path for platform services. Users must understand the split.

### Alternatives Considered

- **Hermetic bundles** — rejected for reasons in Context.
- **Docker-first** — rejected as primary path; retained for infrastructure.
- **Centralized control plane** — rejected for operational complexity.
- **Channel-based subscription with a long-running fleet agent on each host** — considered but found unnecessary: scheduled or webhook-triggered `kb-deploy apply` in CI achieves the same reconciliation without a daemon.

## Implementation

### MVP scope (team/cloud unblock, ~8 days)

| # | Change | Location |
|---|--------|----------|
| 1 | New `kb-create install-service` command. Installs into `~/kb-platform/releases/<id>/`, writes `release.json`, updates `releases.json`. | `tools/kb-create/cmd/install-service.go`, `tools/kb-create/internal/pm/` |
| 2 | Atomic swap + rollback (`kb-create swap`, `kb-create rollback`, `kb-create releases`). Symlink layout under `~/kb-platform/services/<name>/`. | `tools/kb-create/cmd/swap.go`, `rollback.go`, `releases.go` |
| 3 | New `kb-deploy apply` command, registry-only source. Wave-based rollout, health gates, auto-rollback. | `tools/kb-deploy/cmd/apply.go`, `tools/kb-deploy/internal/config/` |
| 4 | `deploy.lock.json` read/write, committed to deploy repo. | `tools/kb-deploy/internal/lock/` |
| 5 | `kb-deploy plan` / `--dry-run`. Human and JSON output. | `tools/kb-deploy/cmd/plan.go` |
| 6 | Secret resolver (`${secrets.X}` / `${env.X}`), validated on plan. | `tools/kb-deploy/internal/secrets/` |
| 7 | GitHub Actions reusable workflow + starter `deploy.yaml.template` + getting-started doc. | `.github/workflows/kb-deploy.yml`, `docs/guides/delivery.md` |

### Follow-up (after MVP validation)

- Workspace source (`kb-deploy pack --from-workspace`, `apply --from-snapshot`)
- Hybrid source (per-component source resolution)
- Selective apply (`--only`, `--target`, `--exclude`)
- `kb-deploy init` with host discovery
- Platform-vs-service update semantics (separate `kb-deploy update-platform` command, coordinated multi-service restart)
- Marketplace UI dual-mode (dev direct / prod PR-generator) and deprecation of installer-side APIs
- Optional cosign signing for regulated environments

### Open questions (to resolve during implementation)

1. Migration path for existing `marketplace.lock` installations.
3. Release-id format — deterministic content hash vs human-readable `<service>-<version>-<hash>`.
4. `kb-create install-service` batch vs one-at-a-time for coordinated platform updates.
5. `deploy.lock.json` commit-back strategy under concurrent CI runs.
6. Drift detection policy when a host's `releases.json` diverges from `deploy.lock.json`.

### Design artifact

Full design discussion and trade-off notes: `~/.claude/plans/kb-labs-delivery-plan.md` (working document, not part of the repo).

## References

- [ADR-0012 — Platform / Project Scope](./0012-platform-project-scope.md)
- [ADR-0013 — Installer Config Placement](./0013-installer-config-placement.md)
- [ADR-0002 — Plugins and Extensibility](./0002-plugins-and-extensibility.md)

---

**Last Updated:** 2026-04-22
**Next Review:** after MVP ships or after 3 months, whichever comes first
