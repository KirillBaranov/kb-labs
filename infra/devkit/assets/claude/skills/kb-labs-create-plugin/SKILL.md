---
name: kb-labs-create-plugin
description: Use when the user wants to create a new KB Labs plugin, asks how to scaffold a plugin, extend KB Labs with new commands, or add a marketplace entity. Do not use for creating services (use kb-labs-create-product) or for adding new packages to an existing plugin.
user-invocable: true
argument-hint: [plugin-name]
---

# Create a KB Labs Plugin

Help the user scaffold a new KB Labs plugin following the platform-standard
three-package layout (`cli` / `core` / `contracts`).

## Step 1: Clarify the plugin intent

Before scaffolding, make sure you know:

- **Plugin name** — kebab-case, without the `kb-labs-` prefix (e.g. `audit`, `deploy`).
  The scaffolded repo will be named `kb-labs-<name>`.
- **What it does** — one sentence. This goes into the plugin manifest `description`.
- **Does it add CLI commands?** — almost always yes.
- **Does it need LLM access / cache / state?** — informs which platform composables
  the plugin will use (`useLLM`, `useCache`, `useState`).

If the user did not provide these, ask concise questions before generating files.

## Step 2: Create the plugin from the template

KB Labs ships a plugin template and a launcher command:

```bash
kb-create plugin --name=$ARGUMENTS
```

If that command is not yet available in the user's kb-create version, fall back to
copying `templates/kb-labs-plugin-template` manually and replacing the package names.

## Step 3: Required package layout

A compliant plugin must have three packages:

```
kb-labs-<name>/
├── packages/
│   ├── <name>-contracts/     # types, interfaces, zod schemas — no runtime deps
│   ├── <name>-core/          # business logic, imports contracts
│   └── <name>-cli/           # command handlers, plugin manifest, imports core
├── package.json              # workspace root
└── pnpm-workspace.yaml
```

Rules:
- `contracts` has zero runtime dependencies beyond `zod`.
- `core` depends on `contracts`.
- `cli` depends on `core` and registers commands via the plugin manifest.
- Do not merge these into a single package — the separation is load-bearing
  for types, tree-shaking, and marketplace distribution.

## Step 4: Plugin manifest

The CLI package must ship `kb.manifest.json` (discovered automatically by the
platform). Minimal shape:

```json
{
  "name": "@kb-labs/<name>",
  "version": "0.1.0",
  "kind": "plugin",
  "commands": [
    {
      "id": "<name>:hello",
      "summary": "Example command",
      "handler": "./dist/handlers/hello.js"
    }
  ]
}
```

## Step 5: Use platform composables, not direct imports

Inside command handlers, read platform capabilities via composables from
`@kb-labs/sdk`:

```ts
import { useLLM, useCache, useState, useLogger } from '@kb-labs/sdk';

export async function handler(ctx, argv, flags) {
  const log = useLogger();
  const cache = useCache();
  // ...
}
```

Do **not** reach into `ctx.platform.*` directly — that path loses prototype
information and breaks wrapper layers (analytics, queuing, proxying).

## Step 6: Build the plugin

```bash
pnpm install
pnpm --filter "@kb-labs/<name>-contracts" build
pnpm --filter "@kb-labs/<name>-core" build
pnpm --filter "@kb-labs/<name>-cli" build
```

Build order matters: contracts → core → cli. If in doubt, use the devkit
build-order tool when it is available in the user's environment.

## Step 7: Clear the plugin cache and verify

The CLI caches plugin manifests. After building a new plugin, always clear the
cache — otherwise the new commands will not be discovered.

```bash
pnpm kb marketplace clear-cache
pnpm kb <name>:hello --help
```

If the command is not found, clear the cache deeply and retry:

```bash
pnpm kb marketplace clear-cache --deep
```

## Step 8: Register in the workspace (only if needed)

If the user is adding the plugin to an existing multi-repo workspace, add it to
`pnpm-workspace.yaml` and to the launcher's project config at
`.kb/kb.config.jsonc`. If the plugin is a standalone repo consumed by a different
project, this step is handled by `kb-create` on the consuming side.

## Definition of done

- Three packages exist and build cleanly
- `kb.manifest.json` is valid
- `pnpm kb <name>:hello --help` works
- Handlers use composables from `@kb-labs/sdk`
- No direct imports of platform internals

## Do not

- Do not create single-package plugins
- Do not edit files under `.kb/` as part of plugin development
- Do not forget to clear the marketplace cache after building
- Do not invent a custom command discovery format — use `kb.manifest.json`
