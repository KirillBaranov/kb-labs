# Contributing to @kb-labs/devkit

Thank you for helping improve `@kb-labs/devkit`! This guide explains how to set up your environment, propose changes, and work with our CI and release flows.

## Principles
- **Automation first**: prefer codified, repeatable processes.
- **Consistency over variety**: align with existing presets and conventions.
- **Small, focused changes**: easier to review and ship.

## Getting started

### Prerequisites
- Node.js 20+
- pnpm 9+
- Git

### Install
```bash
pnpm i
```

### Useful scripts
```bash
pnpm build         # build (noop for this repo, but kept for symmetry)
pnpm lint          # run ESLint
pnpm test          # run Vitest
yarn test:coverage # if a consumer repo uses coverage thresholds
pnpm format        # run Prettier write mode (if defined in consumer)

# Fixture validation scripts
pnpm fixtures:bootstrap  # install fixture dependencies
pnpm fixtures:clean      # remove build artifacts
pnpm fixtures:lint       # run ESLint in fixtures
pnpm fixtures:type-check # run TypeScript type checks
pnpm fixtures:test       # run Vitest tests
pnpm fixtures:build      # build with tsup + emit types
pnpm fixtures:check      # run all validation checks
```

> Note: Some scripts (like `type-check`, `test:coverage`) are referenced inside reusable workflows for consumer repos. They may be optional or no-op here.

## Project structure
- `tsconfig/*` — TypeScript configs (base/cli/lib/node with NodeNext)
- `eslint/*` — ESLint 9 flat config presets (node.js)
- `prettier/index.json` — Prettier config
- `vitest/*` — Vitest configs in JS format (node.js)
- `tsup/*` — Tsup configs in JS format (node.js)
- `agents/*` — AI agent definitions (prompts, runbooks, context)
- `fixtures/*` — Validation fixtures for testing DevKit changes
- `sync/*` — Repository synchronization system
- `workflows-templates/*` — Template workflows for consumer projects
- `.github/workflows/*` — Reusable GitHub workflows
- `.github/actions/setup-node-pnpm` — Reusable action for Node+pnpm setup

**Note:** All presets are available both as folder imports (`@kb-labs/devkit/tsconfig/`) and specific file imports (`@kb-labs/devkit/tsconfig/node.json`) for maximum flexibility.

## AI Agents

This DevKit includes standardized AI agents for common development tasks. Each agent is defined in the `agents/` directory with:

- **`prompt.md`** — AI instructions and context
- **`runbook.md`** — step-by-step procedures  
- **`context.globs`** — file patterns for context (optional)
- **`permissions.yml`** — access permissions (optional)

### Available Agents

- **DevKit Maintainer** (`agents/devkit-maintainer/`) — Enforces unified tooling across projects
- **Test Generator** (`agents/test-generator/`) — Generates and maintains unit tests
- **Docs Drafter** (`agents/docs-drafter/`) — Drafts and updates documentation
- **Release Manager** (`agents/release-manager/`) — Manages releases and changelogs

### Working with Agents

When contributing to agent definitions:
- Keep prompts clear and actionable
- Update runbooks when procedures change
- Test agent prompts in real scenarios
- Maintain consistency across agent styles
- Always re-sync agents before major contributions (`pnpm agents:sync`). This ensures consistent prompts and permissions across repos.

See [`AGENTS.md`](./AGENTS.md) for detailed agent documentation.

## Branching model
- `main` is the default branch.
- Use short-lived feature branches: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.

## Commits
- Prefer conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc.
- Keep messages concise and meaningful; include context in the body if needed.

## Linting & tests
- Run `pnpm lint` and `pnpm test` locally before opening a PR.
- Keep unit tests deterministic and fast.
- For configuration changes, add minimal sample usage in README when relevant.
- **Always run `pnpm fixtures:check` before opening a PR** to ensure DevKit changes don't break downstream consumers.

## Pull requests
- Keep PRs focused and under ~300 lines where possible.
- Include a brief summary of what and why.
- Link related issues if they exist.
- Expect the reusable PR workflow to run: install, build (best-effort), tests.

## Repository Synchronization

The DevKit includes a powerful sync system (`sync/index.mjs`) that allows consumer projects to stay up-to-date with the latest DevKit assets. This is especially useful for maintaining consistent tooling across KB Labs projects.

### Sync System Features

- **Configurable targets**: Sync specific files/directories with custom paths
- **Drift detection**: Check for differences without making changes
- **Drift modes**: `managed-only` (default), `strict`, and `all` for different enforcement levels
- **Provenance tracking**: Automatic creation of `.kb/devkit/tmp/DEVKIT_SYNC.json` with sync metadata
- **Force overwrite**: Option to overwrite existing files
- **Dry run**: Preview changes without applying them
- **JSON output**: Machine-readable output for scripting
- **Custom configuration**: Override default behavior via `kb-labs.config.json`
- **Selective sync**: Sync only specific targets with `only` configuration
- **Scope control**: CLI and config support for drift detection modes

### Adding New Sync Targets

To add a new sync target to the DevKit:

1. **Update `BASE_MAP`** in `sync/index.mjs`:
```javascript
const BASE_MAP = {
  // ... existing targets
  newtarget: {
    from: resolve(DEVKIT_ROOT, 'path/to/source'),
    to: (root) => resolve(root, 'path/to/destination'),
    type: 'file', // or 'dir'
  },
};
```

2. **Test the new target**:
```bash
# Test locally
node sync/index.mjs --dry-run newtarget

# Test in fixtures
cd fixtures/lib
node ../../sync/index.mjs --dry-run newtarget
```

3. **Update documentation** in README.md with the new target

### Sync Configuration Schema

Consumer projects can configure sync behavior via `kb-labs.config.json`:

```json
{
  "sync": {
    "enabled": true,
    "disabled": ["vscode"],
    "only": ["ci", "agents"],
    "scope": "managed-only",
    "force": false,
    "overrides": {
      "cursorrules": { "to": ".config/cursor/rules.json" }
    },
    "targets": {
      "custom": {
        "from": "custom/source",
        "to": "custom/destination", 
        "type": "dir"
      }
    }
  }
}
```

#### Configuration Options

- **`enabled`**: Boolean to enable/disable sync entirely (default: true)
- **`disabled`**: Array of target names to skip during sync
- **`only`**: Array of target names to sync (if empty, syncs all enabled targets)
- **`scope`**: Drift detection mode: `"managed-only"` (default), `"strict"`, or `"all"`
- **`force`**: Boolean to force overwrite existing files
- **`overrides`**: Override source paths, destination paths, or types for existing targets
- **`targets`**: Add custom sync targets with `from`, `to`, and `type` properties

#### Drift Detection Modes

- **`managed-only`** (default): Compare only files explicitly synced from DevKit. Safe for repositories with additional project-specific files.
- **`strict`**: Compare entire target directories and flag unmanaged files as drift. Use when you want to ensure no extra files exist.
- **`all`**: Legacy mode that combines strict checking with unmanaged file detection.

#### Provenance File

After each sync, DevKit creates a `.kb/devkit/tmp/DEVKIT_SYNC.json` file that tracks:
- DevKit version and timestamp
- List of synced targets
- Drift detection scope used

Example:
```json
{
  "source": "@kb-labs/devkit",
  "version": "1.2.3",
  "when": "2025-01-28T12:00:00Z",
  "scope": "managed-only",
  "items": ["ci", "agents", "cursorrules"]
}
```

This file provides transparency about what DevKit manages and when it was last synced.

### Workflow Templates

The `workflows-templates/` directory contains template workflows that consumer projects can copy and customize:

- `ci.yml` — Basic CI workflow template
- `drift-check.yml` — DevKit drift check template
- `release.yml` — Release workflow template
- `sbom.yml` — Software Bill of Materials template

These templates use the reusable workflows from `.github/workflows/` but provide a starting point for consumer projects.

## CI
This repo provides reusable workflows:
- `reusable-ci` (`.github/workflows/ci.yml`) — checkout, setup Node+pnpm, install, lint, optional type-check, tests, optional coverage, build, drift check.
- `reusable-drift-check` (`.github/workflows/drift-check.yml`) — dedicated DevKit drift check workflow.
- `reusable-release` (`.github/workflows/release.yml`) — build, create GitHub release, optional npm publish.

Consumers can call these via `workflow_call`:
```yaml
jobs:
  ci:
    uses: kb-labs/devkit/.github/workflows/ci.yml@main
    with:
      node-version: '20'
      run-coverage: true
      enable-drift-check: true
```

## Releases
- This repo’s release workflow is reusable. To release here:
  - Create and push a tag like `v0.1.0` to `main`.
  - The `reusable-release` job creates a GitHub Release and can publish to npm if `NPM_TOKEN` is provided and `publish: true` is set by the caller.
- For consumer repos, wire a release workflow that calls ours and passes `publish: true` when appropriate.

## Code style
- ESM-first, Node 20 as baseline runtime.
- All presets use ESM format (JS files for easy importing from TS configs).
- ESLint 9 flat config format.
- TypeScript with NodeNext module resolution.
- Follow ESLint and Prettier presets from this repo whenever possible.
- Prefer explicit, readable code over clever shortcuts.

## Security
- Do not commit secrets. Use GitHub Environments/Secrets.
- Report vulnerabilities privately to the maintainers.

## Migration notes

### From CJS to ESM (v0.1.0+)
- ESLint configs now use flat config format (ESLint 9)
- All presets are in JS format for easy importing from TS configs
- TypeScript configs use NodeNext module resolution
- Tsup builds ESM-only by default

### Breaking changes
- ESLint: `.eslintrc.cjs` → `eslint.config.js`
- Vitest: `.ts` configs → `.js` configs
- Tsup: `.ts` configs → `.js` configs
- TypeScript: `module: "ESNext"` → `module: "NodeNext"`

## Governance
- Maintainers have final review authority for presets and workflows.
- Breaking changes require a clear migration note in README and release notes.

## 🏗️ Architecture Decisions

- For significant architectural changes, add an ADR in `docs/adr/`
- Follow the ADR template in `docs/adr/0000-template.md`
- Include required metadata (Date, Status, Deciders, **Last Reviewed**, **Tags**)
- **Last Reviewed** date is required and should be updated periodically
- **Tags** are mandatory (minimum 1, maximum 5 tags from approved list)
- See [Documentation Standard](./docs/DOCUMENTATION.md) for ADR format requirements

## Questions

Open a GitHub Discussion or issue. PRs welcome!

---

**See [Documentation Standard](./docs/DOCUMENTATION.md) for complete documentation guidelines.**
