# e2e/deploy/config-override — ADR-0037 config-injection mechanism

Proves the one claim the "containers are the canonical cloud delivery path"
decision rests on: an operator-mounted config always wins over an image's
baked default, without a rebuild — and the baked default never clobbers a
file that's already live.

```
┌─ host (test.sh) ──────────────────────────────────────────────┐
│  docker build  →  kb-config-override-fixture                  │
│                                                                 │
│  docker run <image>                          → prints "baked-default"
│  docker run <image> -v override.json:...     → prints "operator-mounted-override"
│  docker run <image> -v pre-seeded.json:...    → prints "pre-existing-untouched"
└──────────────────────────────────────────────────────────────┘
```

## Running

Requires Docker.

```sh
# From repo root:
sh e2e/deploy/config-override/test.sh
```

First run builds the image (~1 min); repeat runs are seconds. Exit 0 = all
three scenarios pass. Per `docs/deployment/docker-build-hygiene.md`, the
fixture image is removed on exit (pass or fail); set `KEEP_IMAGE=1` to leave
it for manual debugging.

## What is real

- **`docker-entrypoint.sh` is the exact file shipped** in
  `services/gateway/app/` — not a reimplementation. A pass here is evidence
  about the actual artifact that reaches production, not a simulation of it.
- Real `docker build` / `docker run` against a real Docker daemon.

## What is stubbed

- **No real service.** `CMD` is just `cat /app/.kb/kb.config.json` — the
  fixture's only job is to reveal which config file ended up live, so the
  test can tell "baked default" from "operator override" apart. It does not
  boot gateway, rest-api, or any real process — that needs `pnpm deploy
  --prod` artifacts only CI produces today (tracked in
  `docs/plans/2026-07-31-cloud-deployment-overhaul.md`, Phase 2/CI matrix).
- **Fixture composition is fake** (`marker: "baked-default"` etc.), not a
  real adapter config — this tests the packaging mechanism, not adapter
  wiring.

## Troubleshooting

- **Build hangs or is extremely slow** — check the repo has a
  `.dockerignore` at root (added alongside this fixture; without it, `docker
  build` with repo-root context tars up `.claude/worktrees` and
  `node_modules`, which can be 15GB+ on a long-lived clone).
- **Scenario 3 ("existing live file...") fails with `cp: cannot create
  regular file '.../kb.config.json/kb.config.default.json'`** — this is a
  Docker Desktop file-sharing issue, not an entrypoint bug: bind-mounting a
  file from a host path outside Docker Desktop's shared-paths list (observed
  with plain `/tmp` on macOS) silently produces an empty **directory** at the
  container target instead of the file. `test.sh` avoids this by staging its
  scratch file inside the repo (`./.scratch`, gitignored), which is reliably
  shared since the build context itself comes from there. If you hit this
  with a different scratch location, move it under the repo.

## Files

```
.
├── test.sh                              # the driver — build + 3 scenarios
├── Dockerfile                           # fixture image, built from repo root
├── .gitignore                           # ignores .scratch/ (test.sh runtime state)
└── fixtures/
    ├── kb.config.default.json           # baked default (marker: "baked-default")
    ├── kb.config.mounted-override.json  # operator override (marker: "operator-mounted-override")
    └── marketplace.default.lock         # empty lock, required by the entrypoint's second check
```
