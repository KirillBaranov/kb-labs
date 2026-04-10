# Getting Started with KB Labs Mind

This guide walks through the minimum steps to set up the Mind workspace, run the CLI surfaces from the shared KB Labs CLI, and verify the new layered architecture.

## Prerequisites

- **Node.js** 18.18.0 or newer
- **pnpm** 9.0.0 or newer
- You are working from the monorepo root: `kb-labs/`

All commands below assume the current working directory is the repository root (the same place where `pnpm kb` is defined).

## 1. Install dependencies & sync DevKit

```bash
# From kb-labs/
pnpm install
pnpm --filter @kb-labs/mind devkit:sync
```

This generates shared `tsconfig.paths.json` mappings and keeps `packages/contracts` consumers in sync.

## 2. Build the Mind surfaces

```bash
# Compile every package (recommended after large refactors)
pnpm --filter @kb-labs/mind build

# Or rebuild just the CLI when iterating on commands
pnpm --filter @kb-labs/mind-cli run build
```

Regenerate bundles whenever you touch `src/**` in the CLI, REST, or Studio layers so that the KB CLI can load the latest manifest.

## 3. Wire up the shared KB CLI

Mind commands are exposed through the global KB Labs CLI. Use the helper script declared in the root `package.json`:

```bash
# Show registered plugins and ensure @kb-labs/mind-cli is listed
pnpm kb plugins:list --json
```

If Mind does **not** appear, clear the discovery cache and try again:

```bash
pnpm kb plugins:clear-cache
pnpm kb plugins:list
```

## 4. Run Mind commands

```bash
# Initialise a workspace (.kb/mind is created in the project)
pnpm kb mind init --cwd /path/to/project

# Update indexes with delta tracking
pnpm kb mind update --cwd /path/to/project

# Generate a context pack
pnpm kb mind pack --cwd /path/to/project --intent "demo" --product mind

# One-shot: init/update + pack
pnpm kb mind feed --cwd /path/to/project --intent "demo"
```

The script resolves to `node ./kb-labs-cli/packages/cli/dist/bin.js …`, so you always get the freshest CLI build from the repo.

## 5. Run tests and fixtures

```bash
# Standard package test matrix
pnpm --filter @kb-labs/mind test

# Run CLI smoke tests
pnpm --filter @kb-labs/mind-cli test

# Exercise fixture projects with the new layered CLI
pnpm --filter @kb-labs/mind fixtures:check
```

The fixture runner now calls the shared KB CLI directly, so it uses the same discovery path as real users (`pnpm kb mind …`).

## 6. Useful scripts

- `pnpm devkit:paths` – regenerate path aliases after adding packages or contracts.
- `pnpm clean:cache` – remove `.kb/mind` artefacts plus coverage.
- `pnpm kb plugins:clear-cache` – reset CLI discovery if you change manifests and the KB CLI still shows stale output.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Unknown command: mind` in the KB CLI | Run `pnpm kb plugins:clear-cache`, then `pnpm --filter @kb-labs/mind-cli run build` and `pnpm kb plugins:list`. |
| CLI still sees an old manifest | Clean the cache and re-run `pnpm kb plugins:list --json` to confirm the updated manifest is loaded. |
| TypeScript cannot resolve `@app/*` aliases | Run `pnpm --filter @kb-labs/mind devkit:paths` to regenerate `tsconfig.paths.json`. |

That’s all you need to get productive with the new KB Labs plugin template layout inside Mind.

