# Implementation Plan: Declarative Delivery and Fleet Distribution (ADR-0014)

**ADR:** [docs/adr/0014-declarative-delivery-and-fleet-distribution.md](../adr/0014-declarative-delivery-and-fleet-distribution.md)
**Date:** 2026-04-22
**Status:** Proposed — ready for review

---

## Goal

Unblock team/cloud deployments of KB Labs by introducing a declarative delivery plane:

- Services self-describe their adapter/plugin requirements in `ServiceManifest`.
- `kb-create` installs services into versioned `releases/<id>/` directories with atomic symlink swap and rollback.
- `kb-deploy apply` orchestrates fleet rollouts from a declarative `deploy.yaml` via SSH, with waves / health gates / auto-rollback.
- `deploy.lock.json` in a dedicated deploy repo provides reproducibility and an audit trail.

Soloist workflow (one developer, one machine, workspace-backed) is preserved and reuses the same primitives via `--from-workspace` (follow-up phase).

---

## Decisions on Open Questions

### D1 — Single source of truth for adapter requirements: `deploy.yaml`

**Decision:** service manifests do **not** declare adapter requirements. `deploy.yaml` is the sole place where adapter packages are listed.

Reasoning: the service code already expresses what it needs — `platform.llm.complete(...)`, `platform.cache.get(...)` — via imports and calls. A parallel `requires` field in the manifest would duplicate this information and introduce a drift risk: if a new `platform.analytics` call is added but the manifest is not updated, pre-flight "validation" still passes while runtime fails.

The "you forgot to list an adapter" problem is caught elsewhere, more precisely:
- `kb-deploy plan` validates that the packages named in `deploy.yaml` exist and are semver-resolvable.
- Runtime: if a service requests `platform.X` and no adapter is registered for that role, it fails startup with a specific error naming the missing role.
- `kb-deploy apply` health gate catches the failure and auto-rollbacks the wave.

This keeps the published service packages fully decoupled from any specific adapter (OpenAI vs Anthropic, Redis vs in-memory) — which was the whole point of roles in the first place. Admins see the full picture in `deploy.yaml`, service authors see it in the code.

**deploy.yaml structure** (unchanged from D7):

```yaml
services:
  gateway:
    service: "@kb-labs/gateway"
    version: "1.2.3"
    adapters:
      llm:        "@kb-labs/adapters-openai@0.4.1"
      cache:      "@kb-labs/adapters-redis@0.2.0"
      logger:     "@kb-labs/adapters-pino@0.3.0"
      storage:    "@kb-labs/adapters-fs@0.1.0"
```

**Discoverability for admins:** each published service package includes `examples/deploy.yaml` showing a known-working adapter set. This is a living example, not a schema constraint — admins free to substitute.

**Phase 1 of the implementation plan is therefore a no-op** and is removed from the sequence; the MVP starts with Phase 2 (`kb-create install-service`).

### D2 — Migration path for `marketplace.lock`

**Decision:** `~/kb-platform/releases.json` becomes the new source of truth. `marketplace.lock` is deprecated but read for N+1 releases. On first `kb-create install-service` invocation against an existing install:

1. If `releases.json` missing and `marketplace.lock` present → auto-generate a single `legacy-<timestamp>` release describing current state, point `current` at it.
2. `marketplace` plugin projects `releases.json` into its internal schema at startup (read-only view) so existing runtime code continues to work.
3. Remove `marketplace.lock` support in the release after the first post-MVP minor bump (N+2).

### D3 — Release ID format

**Decision:** `<service-short>-<version>-<hash8>` (e.g. `gateway-1.2.3-a3f2b1c9`).

- `service-short` = package name without `@kb-labs/` prefix.
- `hash8` = first 8 chars of SHA-256 over canonicalized `{service@version, adapters: sorted-specs, plugins: sorted-specs}`.
- Deterministic: same inputs → same ID → idempotent install (repeated call is a no-op if release exists).
- Human-readable enough for logs and `kb-create releases` output.

### D4 — `kb-create install-service` — batch vs one-at-a-time

**Decision:** both levels exist.

- **Low-level:** `kb-create install-service <spec> --adapters ... --plugins ...` — single service, one release. Used directly in tests and by `kb-deploy` per-service.
- **High-level:** `kb-create apply <host-manifest.json>` — accepts a per-host fragment (list of services + platform pin) and coordinates install + swap across all of them in one SSH round-trip. Used by `kb-deploy apply` to reduce latency.

`apply` is a thin orchestrator: it calls `install-service` N times, then swaps all symlinks, then returns a summary. Failures during the batch roll back any releases already swapped within that batch.

### D5 — `deploy.lock.json` commit-back under concurrent CI

**Decision:** two modes, configurable in `deploy.yaml`:

```yaml
rollout:
  lockMode: artifact   # default for CI
  # or
  lockMode: autoCommit # for local / single-runner setups
```

- **`artifact` (default)** — `kb-deploy apply` writes `deploy.lock.json` to the working directory and does not commit. CI workflow commits via standard `git` actions after apply succeeds. Conflicts surface as standard git merge conflicts at PR time.
- **`autoCommit`** — `kb-deploy apply` commits and pushes the lock itself. On push reject, it does `pull --rebase` and retries up to 3 times. After 3 failures: exit code 2 with message `concurrent deploy detected`. Intended for local use and single-runner setups where serialization is trivial.

Advisory lock (e.g. a `kb-deploy-lock` branch or GitHub environment lock) is out of scope for MVP — GitHub environments already provide serialization when used via the canonical reusable workflow.

### D6 — Drift detection policy

**Decision:** follow Terraform's split — `plan` surfaces drift, human picks `apply` (reconcile to desired) or `adopt` (update lock from reality).

```
$ kb-deploy plan
Drift detected on prod-1:
  gateway: lock says 1.2.3, target has 1.2.2 (manual swap at 2026-04-21)

Options:
  kb-deploy apply            # force prod-1 back to 1.2.3
  kb-deploy adopt --host prod-1  # update lock to reflect 1.2.2

Exit code: 4 (drift present)
```

New exit code `4` lets CI fail fast and require human intervention before apply.

### D7 — `deploy.yaml` relationship to existing `.kb/deploy.yaml`

**Decision:** one file, extended schema. Existing top-level keys (`registry`, `infrastructure`, `targets`) continue to power `kb-deploy run` unchanged. New top-level keys (`platform`, `services`, `hosts`, `rollout`) power `kb-deploy apply`. Both may coexist: infrastructure stays under `infrastructure`, platform services under `services`.

Validator rule: presence of `services` requires `hosts`; presence of `targets` requires `registry`. Otherwise the two blocks are orthogonal.

### D8 — `target.platformPath`

**Decision:** optional field on each host, default `~/kb-platform`. Propagated to `kb-create` via `--prefix` (existing flag).

```yaml
hosts:
  prod-1:
    ssh: { user: deploy, host: 1.2.3.4, keyEnv: DEPLOY_KEY }
    platformPath: /opt/kb-platform   # default: ~/kb-platform
```

### D9 — Heterogeneous fleet semantics

**Decision, documented explicitly:**

- A host obtains a platform install if it is referenced under any `services.*.targets.hosts`.
- A host installs a given service iff that host is listed under that service's `targets.hosts`.
- `platform.version` is installed on every host that receives at least one service — a prerequisite for any service install.

### D10 — Platform-vs-service update

**Decision for MVP:** `platform.version` in `deploy.yaml` is validated against the installed platform version on each host. Mismatch emits a warning in `plan`, not an error. Actual platform upgrades remain a manual `kb-create update` invocation until the follow-up `kb-deploy update-platform` command lands.

This deliberately keeps MVP scope to service rollouts. Platform upgrades have broader blast radius (all services restart, marketplace.lock migration, config schema changes) and need a dedicated design pass.

### D11 — `kb-deploy init` scope

**Decision for MVP:** template-only scaffold.

```
$ kb-deploy init
Created: deploy.yaml, .env.example, README.md
Next: edit deploy.yaml and set secrets in .env, then run kb-deploy plan
```

Host discovery (SSH into existing installs, read `releases.json`, generate lock) is deferred to the follow-up phase.

### D12a — Scope placement of `deploy.yaml` and related artifacts

**Decision:** deploy artifacts live in **projectDir** under `<workspace>/.kb/deploy/` by default. A separate deploy repo is an optional escape hatch, not the default.

Layout:

```
<workspace>/
├── .kb/
│   ├── kb.config.jsonc                ← pointer (ADR-0013, unchanged)
│   ├── profiles/
│   ├── workflows/
│   └── deploy/                        ← NEW
│       ├── deploy.yaml
│       ├── deploy.lock.json
│       └── configs/
│           └── gateway.jsonc
└── .env                                ← secrets, gitignored
```

Rationale:
- Platform install is cheap via `kb-create install --version X` in CI — platform defaults are not the thing to version per project.
- What **does** version per project is the combination of service versions / adapter versions / rendered configs. That belongs in the project repo, beside the code it deploys.
- One PR to change config and deploy manifest keeps intent atomic.

**On target hosts:** rendered configs land in `~/kb-platform/releases/<id>/config/` (part of the release). Production hosts need no projectDir.

**Escape hatch:** teams requiring separation of duties extract `.kb/deploy/` to a standalone deploy repo via `git mv`. Schema is identical; `kb-deploy` does not care which repo it runs in.

### D13 — Health-check mechanism

**Decision:** delegate to existing `kb-dev` infrastructure. After swap + restart, `kb-deploy` runs `kb-dev ready <service> --timeout <healthGate> --output json` on the target over SSH. Exit code drives wave pass/fail; JSON output feeds the summary.

**Why:** `kb-dev/internal/health/` already implements HTTP/TCP/Command probes with timeout/latency tracking, and `kb-dev ready` is already designed as an agent-friendly blocking wait. Health checks run locally on the target — no assumption that the control machine can reach the service port. Works in private networks, behind bastions, inside k8s.

### D14 — Bootstrap of `kb-create` onto a target

**Decision:** `kb-deploy` delivers the `kb-create` binary to targets via `scp`, not via `curl | sh` on the target.

Flow:
1. SSH into host, run `kb-create --version`.
2. If missing or version does not match `bootstrap.kbCreateVersion` in `deploy.yaml` — bootstrap phase triggers.
3. Control machine either has the binary pre-downloaded (CI cache / local) or fetches it from `bootstrap.source` (`github` default, `local` for airgap).
4. `scp kb-create-<os>-<arch>` to `bootstrap.installPath` (default `/usr/local/bin`, falls back to `~/bin`).
5. `chmod +x`, verify `--version`.

`deploy.yaml` schema:

```yaml
bootstrap:
  kbCreateVersion: "1.2.0"        # pinned, recorded in lock
  source: github                  # or "local" for airgap
  installPath: /usr/local/bin     # optional
```

Existing `tools/kb-create/install.sh` remains the developer-machine path; it is not used for production rollout.

### D15 — Secrets delivery: reference-only in manifest, tmpfs on target

**Decision:** secrets never touch persistent disk anywhere in the pipeline. Three-layer model.

**Layer 1 — deploy.yaml stores references only**

```yaml
secretBackend:
  type: github-actions     # also: env | vault | aws-sm | gcp-sm

services:
  gateway:
    env:
      OPENAI_KEY: ${secrets.OPENAI_KEY}    # reference, not value
```

`deploy.lock.json` records *which* secrets a service needs (for validation) but never values.

**Layer 2 — resolution on control machine, by backend**

- `github-actions`: GitHub Secrets injected into CI runner env. `kb-deploy` reads `process.env`.
- `env`: reads local process env / `.env` / `.env.local` (developer machine).
- `vault`: OIDC auth from CI → pull. MVP stub, full impl follow-up.
- `aws-sm` / `gcp-sm`: IAM role of CI runner → SDK fetch. Follow-up.

Resolved values are streamed over SSH to the target; never written to a file on the control machine.

**Layer 3 — delivery on target via tmpfs**

`kb-deploy apply` writes `/dev/shm/kb-platform/secrets/<service>.env` on the target:
- tmpfs (RAM) — never in disk backup, swap, coredump, or stolen-drive scenarios.
- Mode `0600`, owner `kb`.
- `kb-dev` reads at service spawn; watchdog auto-restart uses the same path.
- Rendered configs in `releases/<id>/config/*.jsonc` contain only placeholders (`${OPENAI_KEY}`), never values.

**Reboot recovery**

tmpfs is empty after host reboot. MVP: explicit `kb-deploy apply` required to re-hydrate. Follow-up: `kb-dev` on start performs OIDC-auth to the configured backend and self-hydrates. Documented as a known trade-off; monitoring catches reboot-induced degradation.

**Docker / container hosts**

`kb-create install` detects container runtime and adds `--tmpfs /dev/shm/kb-platform` to generated compose / systemd unit. Without this, `/dev/shm` inside container is separate from host and smaller.

**What this does not protect against**

Process memory (`/proc/<pid>/environ`) is readable by root on target. This is the unavoidable floor — no design keeps secrets from root of the machine running the process. Host compromise = secret compromise, regardless of at-rest model. The model above protects against disk-level leaks only, which is the realistic threat surface.

### D17 — `deploy.yaml` schema versioning

**Decision:** mandatory top-level `schema: kb.deploy/1`. `kb-deploy` fails fast on major mismatch (e.g. client on `kb.deploy/1` meeting `kb.deploy/2`). Minor schema additions stay backward-compatible. Without this guard, a breaking change silently corrupts old deployments; adding the field now (rather than later) costs nothing.

### D18 — Lock file is authoritative; ranges resolve only on `upgrade`

**Decision:** `kb-deploy apply` reads versions exclusively from `deploy.lock.json`. Ranges in `deploy.yaml` (e.g. `@kb-labs/adapters-openai@^0.4`) are resolved **only** by explicit `kb-deploy upgrade` (or `plan --refresh`). First apply without a lock requires `kb-deploy upgrade` first.

Prevents the classic "a minor bump broke prod on Monday morning" failure mode. Standard pnpm-style lock semantics.

### D19 — Config drift detection via `configHash` in lock

**Decision:** `deploy.lock.json.services.<id>.configHash` stores `sha256` of the rendered config content. `kb-deploy plan` fetches current hash from target (via `kb-create releases --show-hashes`) and compares. Mismatch is drift, handled by D6.

One column in the lock, one sha256 call per service. No new moving parts.

### D20 — GC protection for rollback depth

**Decision:** `keepReleases` (default 5). Protected: `current` + `previous` always; the rest LRU.

Deeper rollback uses the git history of `deploy.lock.json` — `kb-deploy rollback --to <git-sha>` checks out that lock version and re-installs. No separate "protected releases" registry on target; git already stores the history. 

### D21 — Cross-filesystem rename guard

**Decision:** `kb-create install-service` verifies on first invocation per host that `releases/` and `services/` reside on the same filesystem (`stat().Dev` comparison). On mismatch: fail with actionable message listing both devices and recommending layout fix. Ten lines of code, prevents `EXDEV` on Docker volume mounts.

### D22 — `autoCommit` lock mode warning

**Decision:** `kb-deploy plan` and `kb-deploy apply` both emit a WARN when `rollout.lockMode: autoCommit` is enabled, pointing to the guide section on branch protection and required reviews. Default is `artifact` (safe). Lock signing is a follow-up, not MVP.

### kb-dev manifest compatibility contract

`kb-dev` MUST read manifest `schema` versions N and N-1. Breaking changes to manifest schema require a deprecation period of one minor release. This is a development-time contract, enforced by tests covering both schema versions on every `kb-dev` change. No runtime magic.

### D16 — OS user and supervisor

**Decision:** dedicated non-root user, OS supervisor optional via `deploy.yaml`.

MVP (required):
- Platform user = `kb` (configurable per host). Bootstrap creates the user if absent.
- `~/kb-platform/` owned by `kb`, mode `0750`. Release `.env` mode `0600`.
- `kb-dev` runs detached as the `kb` user. Its internal watchdog handles service-level crashes (`Setpgid`, PID files, exponential backoff — all already implemented).
- If `kb-dev` itself dies, manual restart is required.

Production (opt-in):

```yaml
hosts:
  prod-1:
    ssh: { user: kb, ... }
    supervisor: systemd     # default: none
```

With `supervisor: systemd`, `kb-create install` emits `/etc/systemd/system/kb-dev.service` with `Restart=always`. Two-level resilience: systemd revives `kb-dev`, `kb-dev` revives services. launchd is not supported for production (Linux targets only).

### D12 — Per-component source resolution

**Decision for MVP:** one global source, set at `platform.registry`. Per-service override and workspace source land in the follow-up phase together with `snapshot pack`.

---

## Affected Files

### New files

```
tools/kb-create/cmd/install-service.go         ← new command
tools/kb-create/cmd/swap.go                    ← new command
tools/kb-create/cmd/rollback.go                ← new command
tools/kb-create/cmd/releases.go                ← new command
tools/kb-create/cmd/apply.go                   ← batch orchestrator
tools/kb-create/internal/releases/releases.go  ← releases.json read/write + GC
tools/kb-create/internal/releases/id.go        ← deterministic release-id
tools/kb-create/internal/releases/swap.go      ← atomic symlink swap

tools/kb-deploy/cmd/apply.go                   ← new command
tools/kb-deploy/cmd/plan.go                    ← new command
tools/kb-deploy/cmd/rollback.go                ← new command
tools/kb-deploy/cmd/adopt.go                   ← new command
tools/kb-deploy/cmd/init.go                    ← new command
tools/kb-deploy/internal/manifest/schema.go    ← extended config schema
tools/kb-deploy/internal/manifest/validate.go  ← validate deploy.yaml schema + package existence
tools/kb-deploy/internal/lock/lock.go          ← deploy.lock.json read/write
tools/kb-deploy/internal/orchestrator/         ← waves, health gates, rollback
tools/kb-deploy/internal/secrets/resolver.go   ← ${secrets.X} / ${env.X}
tools/kb-deploy/internal/ssh/kbcreate.go       ← invoke kb-create on remote

.github/workflows/kb-deploy.yml                ← reusable workflow
docs/guides/delivery.md                        ← getting-started guide
```

### Modified files

```
tools/kb-create/internal/manifest/types.go     ← add Adapters, Plugins to service spec
tools/kb-create/internal/pm/pnpm.go            ← support install in subdirectory
tools/kb-create/cmd/create.go                  ← initialize releases.json on fresh install
tools/kb-create/cmd/update.go                  ← remains whole-platform update
tools/kb-deploy/internal/config/config.go      ← extend Config struct
tools/kb-deploy/main.go                        ← register new commands
```

---

## Phased Implementation

Seven phases, each independently shippable and testable. Total estimate **~8 days** of focused work (Phase 1 removed per D1).

### Phase 1 — removed

Originally proposed: extend `ServiceManifest` with a `requires.adapters` section. Removed per D1 — adapter requirements are already expressed by the service code, and duplicating them in the manifest creates drift risk without adding validation power beyond what runtime + health-gate already provide. The MVP starts directly at Phase 2.

---

### Phase 2 — `kb-create install-service` (2 days)

**Files:** `tools/kb-create/cmd/install-service.go`, `internal/releases/`.

**Command:**

```
kb-create install-service <service-pkg>@<version> \
  --adapters "primaryLLM=@kb-labs/adapters-openai@0.4.1,cache=@kb-labs/adapters-redis@0.2.0" \
  --plugins "@kb-labs/marketplace@1.0.0" \
  --registry https://registry.npmjs.org \
  --prefix ~/kb-platform \
  [--release-id <id>]
```

**Algorithm:**

1. Compute release ID (D3). If `--release-id` provided, use it; else derive deterministically.
2. If `releases/<id>/` already exists and `.incomplete` marker absent → exit 0 (idempotent no-op).
3. Create `releases/<id>/` with `.incomplete` marker.
4. Generate `package.json` listing pinned versions of service + adapters + plugins.
5. Run `pnpm install --prefix releases/<id> --registry <registry>`.
6. Read `ServiceManifest` from `releases/<id>/node_modules/<service>/dist/manifest.json` for runtime metadata (port, healthCheck, dependsOn).
7. Write `releases/<id>/release.json` (service, adapters, plugins with resolved versions, integrity hashes, timestamp).
8. Remove `.incomplete`.
9. Append to `releases.json` index (see `internal/releases/releases.go`):

```json
{
  "schema": "kb.releases/1",
  "releases": [
    { "id": "gateway-1.2.3-a3f2b1c9", "service": "@kb-labs/gateway", "version": "1.2.3", "createdAt": "..." }
  ],
  "current":  { "@kb-labs/gateway": "gateway-1.2.3-a3f2b1c9" },
  "previous": { "@kb-labs/gateway": "gateway-1.2.2-f1d8a2e3" }
}
```

Note: `install-service` does **not** touch `current` or `previous`. That is `swap`'s job.

10. GC: if more than `--keep-releases N` (default 3) releases exist for this service, delete the oldest (except current and previous).

**Migration from `marketplace.lock` (D2):** if `releases.json` missing and `marketplace.lock` present in the target prefix, generate a `legacy-<timestamp>` release describing the current state and set `current` to it before starting the new install.

**Test:** fixtures with a stub registry (Verdaccio in test harness) verifying install, idempotency, GC, migration.

---

### Phase 3 — atomic swap + rollback (1 day)

**Files:** `tools/kb-create/cmd/swap.go`, `rollback.go`, `releases.go`, `internal/releases/swap.go`.

**Layout:**

```
~/kb-platform/
├── releases/
│   ├── gateway-1.2.3-a3f2b1c9/
│   └── gateway-1.2.2-f1d8a2e3/
├── services/
│   └── gateway/
│       ├── current  → ../../releases/gateway-1.2.3-a3f2b1c9  (symlink)
│       └── previous → ../../releases/gateway-1.2.2-f1d8a2e3  (symlink)
└── releases.json
```

**Swap algorithm** (`internal/releases/swap.go`):

```go
func Swap(platformDir, service, releaseID string) error {
    svcDir := filepath.Join(platformDir, "services", service)
    target := filepath.Join("..", "..", "releases", releaseID)

    // 1. Record existing current as previous (if exists).
    oldCurrent, _ := os.Readlink(filepath.Join(svcDir, "current"))

    // 2. Create new symlink next to current.
    newLink := filepath.Join(svcDir, "current.new")
    _ = os.Remove(newLink)
    if err := os.Symlink(target, newLink); err != nil {
        return err
    }

    // 3. Atomic rename. POSIX rename() is atomic.
    if err := os.Rename(newLink, filepath.Join(svcDir, "current")); err != nil {
        return err
    }

    // 4. Update previous to point at oldCurrent.
    if oldCurrent != "" {
        _ = os.Remove(filepath.Join(svcDir, "previous"))
        _ = os.Symlink(oldCurrent, filepath.Join(svcDir, "previous"))
    }

    // 5. Update releases.json current/previous mapping.
    return updateReleasesJSON(platformDir, service, releaseID, oldCurrent)
}
```

**Rollback** = `Swap(previous.Target())`. Fails with actionable error if `previous` missing (GC'd or first install).

**`kb-create releases <service>`** — lists releases for a service with current/previous markers, sizes, ages.

**Contract with `kb-dev`:** service processes are started with absolute path resolved from `current` at start time. Restart is required after swap — documented and enforced by `kb-deploy`.

**Test:** swap preserves previous, rollback returns to it, concurrent swap serialization via `flock` on `releases.json`.

---

### Phase 4 — `kb-deploy apply` (registry-only) (3 days)

**Files:** `tools/kb-deploy/cmd/apply.go`, `internal/manifest/`, `internal/orchestrator/`, `internal/ssh/kbcreate.go`.

**Config schema extension** (`internal/config/config.go`):

```go
type Config struct {
    // ── existing (unchanged) ─────
    Registry       string
    Infrastructure map[string]InfraService
    Targets        map[string]Target

    // ── NEW ──────────────────────
    Platform PlatformConfig        `yaml:"platform"`
    Services map[string]Service    `yaml:"services"`
    Hosts    map[string]Host       `yaml:"hosts"`
    Rollout  RolloutConfig         `yaml:"rollout"`
}

type Service struct {
    Service  string                   `yaml:"service"`    // e.g. "@kb-labs/gateway"
    Version  string                   `yaml:"version"`
    Adapters map[string]string        `yaml:"adapters"`   // role → npm spec
    Plugins  map[string]string        `yaml:"plugins"`    // package → spec
    Config   string                   `yaml:"config"`     // path to config file
    Env      map[string]string        `yaml:"env"`        // may contain ${secrets.X}
    Targets  ServiceTargets           `yaml:"targets"`
}

type ServiceTargets struct {
    Hosts       []string `yaml:"hosts"`
    Strategy    string   `yaml:"strategy"`     // "canary" | "all"
    Waves       []int    `yaml:"waves"`        // e.g. [1, 50, 100]
    HealthGate  string   `yaml:"healthGate"`   // "30s"
}

type Host struct {
    SSH          SSHConfig `yaml:"ssh"`
    PlatformPath string    `yaml:"platformPath"` // default: "~/kb-platform"
}

type RolloutConfig struct {
    AutoRollback bool   `yaml:"autoRollback"`
    Parallel     int    `yaml:"parallel"`     // default: 1
    LockMode     string `yaml:"lockMode"`     // "artifact" (default) | "autoCommit"
}
```

**Algorithm:**

```
1. Parse deploy.yaml.
2. Resolve secrets (${secrets.X} → env → .env). Fail on missing.
3. Validate schema (D7 rules).
4. Load previous deploy.lock.json (if exists).
5. For each host in union of services[*].targets.hosts:
     SSH → read releases.json → record observed state.
6. Detect drift (D6). If drift present and --no-adopt: exit 4.
7. Compute per-(host, service) action plan:
     - install   → release-id missing on host
     - swap      → release-id present, but current points elsewhere
     - restart   → current correct, but service unhealthy
     - skip      → current correct, service healthy
     - bootstrap → host has no platform install at all
8. Serialize hosts into waves per service.targets.strategy and waves percentages.
9. For each wave, in parallel up to rollout.parallel:
     For each host:
       - If bootstrap: kb-create install --prefix <platformPath> --version <platform.version>
       - Render config file with secrets, scp to host
       - Call kb-create apply <host-manifest.json> over SSH (D4 batch)
         (installs all needed services, swaps, returns per-service status)
       - kb-dev restart <service> for each affected service
       - Health check per service.runtime.healthCheck with healthGate timeout
     If any host in wave fails AND rollout.autoRollback:
       parallel rollback all hosts in this wave (kb-create rollback + kb-dev restart)
       return error, abort remaining waves.
10. On success: write deploy.lock.json (D5).
11. Emit summary (human or JSON per --output).
```

**Exit codes:**
- 0 — no changes
- 1 — changes applied successfully
- 2 — error (validation, infrastructure, network)
- 3 — rollback fired and succeeded
- 4 — drift detected (only from `plan`, or from `apply` with `--no-adopt`)

**Host-manifest fragment** (D4) sent to `kb-create apply`:

```json
{
  "platformVersion": "1.5.0",
  "services": [
    {
      "service": "@kb-labs/gateway",
      "version": "1.2.3",
      "adapters": { "primaryLLM": "@kb-labs/adapters-openai@0.4.1", ... },
      "plugins":  { "@kb-labs/marketplace": "1.0.0" },
      "configFile": "/tmp/gateway.jsonc",
      "desiredReleaseId": "gateway-1.2.3-a3f2b1c9"
    }
  ]
}
```

`kb-create apply` returns JSON per service: `{installed, swapped, noop}`, with release IDs.

**Test:** integration tests with 2-host local Docker fixture (two containers as SSH targets), verifying wave progression, health gate, auto-rollback on induced failure.

---

### Phase 5 — `deploy.lock.json` (0.5 day, within Phase 4)

**File:** `tools/kb-deploy/internal/lock/lock.go`.

**Schema:**

```json
{
  "schema": "kb.deploy.lock/1",
  "generatedAt": "2026-04-22T15:30:12Z",
  "generatedBy": "kb-deploy@1.0.0",
  "platform": { "version": "1.5.0" },
  "services": {
    "gateway": {
      "resolved":  "@kb-labs/gateway@1.2.3",
      "integrity": "sha256-...",
      "adapters": {
        "primaryLLM": { "resolved": "@kb-labs/adapters-openai@0.4.1", "integrity": "sha256-..." },
        "cache":      { "resolved": "@kb-labs/adapters-redis@0.2.0", "integrity": "sha256-..." }
      },
      "appliedTo": {
        "prod-1": { "releaseId": "gateway-1.2.3-a3f2b1c9", "appliedAt": "2026-04-22T15:30:12Z" },
        "prod-2": { "releaseId": "gateway-1.2.3-a3f2b1c9", "appliedAt": "2026-04-22T15:30:45Z" }
      }
    }
  }
}
```

Secret values never written.

---

### Phase 6 — `kb-deploy plan` / `--dry-run` (1 day)

**Files:** `tools/kb-deploy/cmd/plan.go`, `cmd/adopt.go`.

Re-uses the same plan computation as `apply` (D6), stops at step 7, emits the plan.

**Human output:**

```
Plan: deploy.yaml → 3 hosts

gateway:
  prod-1: gateway@1.2.2 → 1.2.3          [update]
          primaryLLM: openai@0.4.0 → 0.4.1 [update]
  prod-2: gateway@1.2.2 → 1.2.3          [update]
  prod-3: <not installed> → 1.2.3         [bootstrap + install]

Rollout: canary [1, 50, 100], healthGate 30s, lockMode artifact
No drift.
Summary: 3 updates, 1 bootstrap, 0 no-op
```

**JSON output** (`--output json`): stable machine-readable schema suitable for PR comment rendering.

**`kb-deploy adopt`** — reads current state on target, regenerates `deploy.lock.json` from reality. Used when drift is intentional and should be absorbed.

---

### Phase 7 — secret resolver (0.5 day)

**File:** `tools/kb-deploy/internal/secrets/resolver.go`.

Syntax: `${secrets.X}` (fallback chain) and `${env.X}` (no fallback).

Resolution for `secrets.X`:
1. `os.Getenv("X")`
2. `.env` file in cwd
3. `.env.local` in cwd
4. Error: `missing secret: X`

Validated at `plan` time (all `${secrets.X}` references in `deploy.yaml` resolve before any network call).

Resolved values wrapped in a `SecretString` type with `String() → "***"` so they cannot leak via default formatting. Output goes through a stripping layer that replaces secret values with `***` before any log write.

---

### Phase 8 — GitHub Actions workflow + starter template + docs (1 day)

**`.github/workflows/kb-deploy.yml`** — reusable workflow callable from consumer repos:

```yaml
name: KB Deploy
on:
  workflow_call:
    inputs:
      manifest:    { default: 'deploy.yaml', type: string }
      environment: { required: true, type: string }
    secrets:
      DEPLOY_KEY:  { required: true }
      OPENAI_KEY:  { required: false }

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      has-changes: ${{ steps.plan.outputs.has-changes }}
    steps:
      - uses: actions/checkout@v4
      - uses: kb-labs/setup-kb-deploy@v1
      - id: plan
        run: |
          kb-deploy plan ${{ inputs.manifest }} --output json > plan.json
          echo "has-changes=$(jq '.summary.total > 0' plan.json)" >> $GITHUB_OUTPUT
      - uses: actions/upload-artifact@v4
        with: { name: plan, path: plan.json }

  apply:
    needs: plan
    if: needs.plan.outputs.has-changes == 'true' && github.event_name == 'push'
    environment: ${{ inputs.environment }}   # native GH approval gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kb-labs/setup-kb-deploy@v1
      - run: kb-deploy apply ${{ inputs.manifest }} --yes --output json
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          OPENAI_KEY: ${{ secrets.OPENAI_KEY }}
      - name: Commit lock
        run: |
          git config user.name "kb-deploy[bot]"
          git config user.email "kb-deploy@users.noreply.github.com"
          git add deploy.lock.json
          git commit -m "chore(deploy): update lock" || exit 0
          git push
```

**Starter template** (`kb-deploy init` emits this):

```yaml
# deploy.yaml — KB Labs fleet manifest
# Docs: https://kb-labs.dev/docs/delivery

platform:
  version: "1.5.0"
  registry: https://registry.npmjs.org

services:
  gateway:
    service: "@kb-labs/gateway"
    version: "1.0.0"
    adapters:
      llm: "@kb-labs/adapters-openai@^0.4"
    config: ./configs/gateway.jsonc
    env:
      OPENAI_KEY: ${secrets.OPENAI_KEY}
    targets:
      hosts: [prod-1]
      strategy: canary
      waves: [100]
      healthGate: 30s

hosts:
  prod-1:
    ssh: { user: deploy, host: 0.0.0.0, keyEnv: DEPLOY_KEY }

rollout:
  autoRollback: true
  lockMode: artifact
```

**Getting-started guide** (`docs/guides/delivery.md`) — 15-minute walkthrough: init, configure, plan, apply, rollback. One-page.

---

## Testing Strategy

### Unit tests (per package)

- `kb-create/internal/releases`: release-id determinism, swap atomicity, GC correctness, migration from `marketplace.lock`.
- `kb-deploy/internal/manifest`: schema validation (D7 rules), drift detection.
- `kb-deploy/internal/secrets`: resolution chain, redaction in output.
- `kb-deploy/internal/lock`: read/write, schema integrity.

### Integration tests

Fixture: two Docker containers acting as SSH targets, each with a fresh platform install.

Scenarios:
1. Fresh deploy: 0 → 1.0.0 on both hosts.
2. Rolling update: 1.0.0 → 1.1.0, canary waves [50, 100], verify one host at a time.
3. Health-gate failure: induce failing health on host 2, verify auto-rollback of host 1.
4. Idempotency: repeat `apply` on steady state, expect exit 0 and no changes.
5. Drift: manually `kb-create swap` on host 1 to old release, verify `plan` shows drift, `adopt` reconciles lock.
6. Migration: bootstrap with pre-existing `marketplace.lock`, verify `legacy-*` release is created.

### Manual validation

Apply the full pipeline against Kirill's personal staging host (aeza-proxy) as the first real user of the flow. Use the same `deploy.yaml` style a client admin would write. Any friction found here is blocking for MVP completion.

---

## Rollout / Migration

### Backward compatibility

- Existing `kb-deploy run` continues to work for `infrastructure` + `targets` blocks.
- Existing `kb-create create` / `update` unchanged in behavior.
- Existing installs without `releases/` directory work unchanged until first `kb-create install-service` call, at which point auto-migration (D2) triggers.

### Rollout sequence

1. Ship Phases 2–3 behind `kb-create install-service` — no impact on existing users (Phase 1 removed per D1).
2. Ship Phases 4–6 as `kb-deploy apply` subcommand — existing `kb-deploy run` untouched.
3. Ship Phase 7 (secrets resolver) and Phase 8 — docs + GA workflow. Announce the flow.
4. **Dogfood on aeza-proxy.** Do not promote to users until the soloist flow works end-to-end there.
5. Promote to client admins once validated.

### Follow-up phase (deferred, tracked separately)

- Workspace source (`kb-deploy pack --from-workspace`) and snapshot apply.
- Hybrid source resolution (per-component overrides).
- Selective apply flags (`--only`, `--target`, `--exclude`).
- `kb-deploy init --discover` (host probing).
- `kb-deploy update-platform` (platform-version rollout coordination).
- Marketplace UI dual-mode and PR-generator integration.
- Cosign signing for regulated environments.

---

## References

- [ADR-0014 — Declarative Delivery and Fleet Distribution](../adr/0014-declarative-delivery-and-fleet-distribution.md)
- [ADR-0012 — Platform / Project Scope](../adr/0012-platform-project-scope.md)
- [ADR-0013 — Installer Config Placement](../adr/0013-installer-config-placement.md)
- Design notes (working doc): `~/.claude/plans/kb-labs-delivery-plan.md`

---

**Last Updated:** 2026-04-22
