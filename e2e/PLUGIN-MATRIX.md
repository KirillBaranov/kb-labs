# Plugin E2E matrix

Per-plugin end-to-end suites, run **only for the plugins that actually changed**.

## Two matrices

`devkit.yaml` splits the e2e domains into two categories (same `e2e-suite` preset,
same `pnpm run e2e` task, same `--affected` tracking):

| Category | Subject | Domains |
|---|---|---|
| `plugin-e2e-suite` | a specific **plugin** | `mind`, `workflows`, `marketplace`, `plugins` |
| `e2e-suite` | platform / infra layer | `services`, `platform`, `gateway`, `marketplace-registry`, `studio`, `rest-api`, `mcp` |

Each `e2e/<suite>` package `devDepends` on the plugin's `workspace:*` packages, so
kb-devkit's affected engine links them: edit `plugins/mind/**` → `@kb-labs/mind-*`
is affected → `e2e-mind` is affected → only its suite runs. Change a shared dep
(`sdk`, `core/*`) → every dependent plugin suite is affected (transitive).

## Local

```bash
# Run ONLY the suites whose plugin changed (vs the git base):
KB_DEV_BIN="$PWD/tools/kb-dev/kb-dev" ./tools/kb-devkit/kb-devkit run e2e --affected

# One suite explicitly:
KB_DEV_BIN="$PWD/tools/kb-dev/kb-dev" ./tools/kb-devkit/kb-devkit run e2e --packages @kb-labs/e2e-mind
```

The runner (`kb-labs-e2e-runner`) applies each scenario via `kb-dev ensure
--scenario …` (overlay + restart) and runs Playwright. `KB_DEV_BIN` points it at
the repo's `kb-dev` binary; without it the runner looks for `kb-dev` on `PATH`.

Suites with real-service / opt-in tests (e.g. `mind`'s real-embedder bench) **skip**
unless their env flag is set — for mind: `MIND_BENCH_REAL=1` plus live OpenAI + Qdrant.

## CI

`.github/workflows/e2e-plugins.yml` — `discover` job asks kb-devkit which packages
the PR diff affects, maps them to suites via `scripts/ci/affected-plugin-e2e.mjs`,
and emits a dynamic matrix. Only affected suites spin up a Docker stack
(`reusable-e2e-docker.yml`); a PR touching no plugin runs zero shards.

## Adding a new plugin suite

1. Create `e2e/<plugin>/` (mirror an existing domain; `package.json` `devDepends`
   on the plugin's `@kb-labs/<plugin>-*` packages — this is the affected link).
2. Add `e2e/<plugin>` to the `plugin-e2e-suite` category in `devkit.yaml`.
3. Add `<plugin>` to `PLUGIN_E2E_SUITES` in `scripts/ci/affected-plugin-e2e.mjs`.

That's it — local `--affected` and the CI matrix pick it up automatically.
