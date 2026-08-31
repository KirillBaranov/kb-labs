# @kb-labs/release — Release Manager

Atomic release plugin for the KB Labs platform. Takes your code → computes version bumps → runs pre-release checks → publishes packages → tags git.

Designed to be a single composable step in a workflow: the output artifacts (published packages, git tags, report, changelog) are consumed by the next step — whether that's opening a GitHub PR, sending a Slack notification, or triggering a deploy. The plugin itself does none of that.

---

## Quick Start

```bash
# See what would be released (no changes made)
kb release plan

# Drive a receipt-driven release candidate through the release control plane
# (replaces the old `kb release run`/`kb release promote` checkout-based pipeline —
# see the "kb release candidate" section below and docs/runbooks/release-control-plane.md)
kb release candidate --flow platform --target canary --dry-run --json
```

---

## Commands

### `kb release plan`

Discover modified packages and compute version bumps based on conventional commits. Does not publish anything.

```bash
kb release plan
kb release plan --scope @my-org/core
kb release plan --bump minor
kb release plan --json
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--scope` | Filter packages by name or glob (e.g. `@my-org/core`, `packages/*`) |
| `--bump` | Override bump: `patch`, `minor`, `major`, `auto` (default: `auto`) |
| `--json` | Output plan as JSON |

---

### `kb release candidate` (replaces `kb release run`)

`kb release run` — the checkout-based pipeline that did plan → confirm →
checks → build → verify → publish → git tag in one shot, with no bundle, no
receipt and no approval — has been deleted (release control-plane cutover,
execution plan §11 item 7). So has its publish-only companion
`kb release promote`.

The replacement is receipt-driven: it runs plan → source checks → stage →
package → seal → verify-bundle, renders the release map over the already-sealed
bundle, and stops for one human approval before it commits/delivers/activates
anything.

```bash
kb release candidate --flow platform --target canary --dry-run --json  # rehearse
kb release candidate --flow platform --target canary --json            # drive it; stops at `bundled`
kb release approve --receipt <receiptId> --actor "$USER" --json         # the one approval
kb release candidate --flow platform --target canary --json            # resume; same command
kb release receipt --receipt <receiptId> --json                        # inspect state/history any time
```

**Flags (`release candidate`):**

| Flag | Description |
|------|-------------|
| `--flow` | Named release flow (default: `platform`) |
| `--target` | Requested channel; only `canary` is a candidate operation (default: `canary`) |
| `--receipt` | Existing receipt id to resume; omit to start a new operation |
| `--actor` | Operator identity recorded on every transition (or `KB_RELEASE_ACTOR`) |
| `--dry-run` | Drive the state machine against the simulated pipeline and fake delivery plane |
| `--json` | Output result as JSON |

A non-dry-run currently refuses with a typed diagnostic: the CI half of the
delivery plane exists, but the Workflow-side adapter that dispatches
`release-deliver.yml` and the endpoints it writes through are not deployed yet.
See [docs/runbooks/release-control-plane.md](../../../docs/runbooks/release-control-plane.md).

**Exit codes:** `0` = success, `1` = failure.

---

### `kb release verify`

Validate release readiness without executing anything.

```bash
kb release verify
kb release verify --fail-if-empty
kb release verify --fail-on-breaking
kb release verify --allow-types feat,fix
```

| Flag | Description |
|------|-------------|
| `--fail-if-empty` | Exit 1 if no packages need a version bump |
| `--fail-on-breaking` | Exit 1 if breaking changes detected |
| `--allow-types` | Comma-separated commit types required (e.g. `feat,fix`) |

---

### `kb release changelog`

Generate a changelog from git history using conventional commits.

```bash
kb release changelog
kb release changelog --from v1.0.0
kb release changelog --template corporate-ai
kb release changelog --format md --level detailed
```

| Flag | Description |
|------|-------------|
| `--from` | Start commit or tag |
| `--to` | End commit (default: HEAD) |
| `--since-tag` | Shorthand for `--from <tag>` |
| `--template` | Builtin: `corporate`, `corporate-ai`, `technical`, `compact`. Or path to custom template. |
| `--format` | `json`, `md`, `both` (default: `both`) |
| `--level` | `compact`, `standard`, `detailed` (default: `standard`) |
| `--breaking-only` | Only breaking changes |

---

### `kb release rollback`

Restore `package.json` versions from the last pre-mutation snapshot. Applies to
the standalone version/git building-block commands below, used directly against
the primary checkout — `release candidate`'s own mutations happen in a
disposable worktree instead, so there is nothing in the primary checkout for
this rollback to undo for a candidate operation.

```bash
kb release rollback
kb release rollback --json
```

---

### `kb release report`

Show the last release execution report.

```bash
kb release report
kb release report --json
```

---

## Configuration (`kb.config.json`)

All plugin behavior is controlled via the `release` section of your `kb.config.json` (under `profiles[].products.release`).

### Minimal config

```json
{
  "profiles": [{
    "products": {
      "release": {
        "versioningStrategy": "independent"
      }
    }
  }]
}
```

### Full reference

```json
{
  "release": {
    "versioningStrategy": "independent",
    // "independent"  — each package bumped by its own commits (default)
    // "lockstep"     — all packages get the same (max) bump
    // "adaptive"     — lockstep if any breaking change, else independent

    "bump": "auto",
    // Default bump when commits are ambiguous (overridden by --bump flag)
    // "auto" = detect from conventional commits

    "registry": "https://registry.npmjs.org",
    // npm registry URL (default: https://registry.npmjs.org)

    "strict": false,
    // Fail the release if any non-optional check fails (same as --strict flag)

    "packages": {
      // Package discovery — which packages to include in the release
      "paths": ["packages/*", "apps/*"],
      // Directories to scan. If omitted, the entire repo tree is scanned.

      "include": ["@my-org/*"],
      // Include only packages matching these patterns (name or path glob)

      "exclude": ["@my-org/internal-*", "apps/playground"]
      // Exclude packages matching these patterns
    },

    "scopes": {
      // Per-scope overrides — scope is passed via --scope flag
      "@my-org/core": {
        "packages": {
          "include": ["@my-org/core", "@my-org/types"]
        },
        "checks": [
          // If set, adds to global checks; matching ids override the global check
          { "id": "test", "command": "pnpm", "args": ["test", "--", "--run"], "runIn": "scopePath" }
        ]
      }
    },

    "checks": [
      // Pre-release checks — run before version bump and publish
      {
        "id": "build",
        "command": "pnpm",
        "args": ["run", "build"],
        "runIn": "scopePath",
        // runIn: where to execute
        //   "scopePath"  — once in the scope directory (default for monorepo builds)
        //   "repoRoot"   — once in the git repo root
        //   "perPackage" — once per discovered package
        "timeoutMs": 300000
      },
      {
        "id": "tests",
        "command": "pnpm",
        "args": ["run", "test", "--", "--run"],
        "runIn": "scopePath",
        "timeoutMs": 120000,
        "optional": true
        // optional: true means failure is reported but does not block release
      },
      {
        "id": "typecheck",
        "command": "pnpm",
        "args": ["run", "type-check"],
        "runIn": "scopePath",
        "timeoutMs": 120000,
        "optional": true
      }
    ],

    "publish": {
      "access": "public",
      // npm publish --access: "public" (default) or "restricted"

      "packageManager": "pnpm"
      // Package manager to invoke: "pnpm" (default), "npm", "yarn"
    },

    "changelog": {
      "locale": "en",
      // Locale for generated text: "en" (default), "ru"

      "template": "technical",
      // Builtin: "corporate" | "corporate-ai" | "technical" | "compact"
      // Or path to a custom .ts template file

      "format": "both",
      // "json" | "md" | "both"

      "level": "standard",
      // "compact" | "standard" | "detailed"

      "includeTypes": ["feat", "fix", "perf", "refactor"],
      // Commit types to include

      "excludeTypes": ["chore", "style", "test"]
      // Commit types to exclude
    },

    "git": {
      "provider": "auto"
      // Git provider for link generation: "auto" | "github" | "gitlab" | "generic"
    },

    "rollback": {
      "enabled": true,
      "maxHistory": 5
    }
  }
}
```

---

## Artifacts

`kb release candidate` writes the operational state a `kb release run`
execution report used to summarize after the fact — but as durable, resumable
state, not a one-shot log:

| Artifact | Path | Description |
|----------|------|-------------|
| Receipt | `.kb/release/receipts/<receiptId>.jsonl` | Append-only transition history — the single source of truth for a release's state |
| Version ledger | `.kb/release/ledger/` | Atomic version reservations, never reused |
| Sealed candidate bundle | `.kb/release/candidates/<candidateId>/bundle/` | The exact artifacts a human approval signs |
| Changelog | `<package>/CHANGELOG.md`, `.kb/release/CHANGELOG.md` | Generated changelog, frozen at plan time |
| Git tags | In git | `v1.2.3` (lockstep) or `@my-org/core@1.2.3` (independent), created by `release commit` after approval |

See [docs/runbooks/release-control-plane.md](../../../docs/runbooks/release-control-plane.md)
§1 for the full state layout, including dry-run isolation.

---

## CI / Headless Mode

```bash
# Rehearse against the simulated pipeline and fake delivery plane
kb release candidate --flow platform --target canary --dry-run --json

# Drive the real receipt (refuses today until the Workflow-side delivery
# adapter and its endpoints are deployed — see the runbook)
NODE_AUTH_TOKEN=npm_xxx kb release candidate --flow platform --target canary --json
```

**Exit codes:**
- `0` — success or user cancelled
- `1` — pipeline failure (checks, build, publish, or git error)

The full report is in `.kb/release/history/` regardless of exit code.

---

## Pre-push Hook Visibility

When a `git push` step takes unexpectedly long, the CLI shows elapsed time:

```
[18.3s] Committing and tagging release...
```

If you know your pre-push hooks are slow, you can either:
- Pass `--no-verify` to bypass them during release (hooks still run on regular commits)
- Use `runIn: "scopePath"` checks to run equivalent validation before the push step

---

## Using with Workflow Engine

The release plugin is an atomic step. Example workflow:

```yaml
steps:
  - id: release
    plugin: "@kb-labs/release"
    command: release:run
    args: ["--yes", "--json"]
    env:
      NODE_AUTH_TOKEN: "${secrets.NPM_TOKEN}"

  - id: open-pr
    depends_on: [release]
    # reads release artifacts (report.json, git tags) from previous step
```

The plugin does not open PRs, send notifications, or trigger deploys — that's your workflow's job.
