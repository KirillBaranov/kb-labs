# KB Labs CLI Reference

Generated: 2025-12-31T02:03:20.623Z

Total Commands: 69

---

## Table of Contents

- [analytics](#analytics) (1 commands)
- [commit](#commit) (6 commands)
- [core](#core) (1 commands)
- [devlink](#devlink) (1 commands)
- [docs](#docs) (1 commands)
- [info](#info) (5 commands)
- [logging](#logging) (3 commands)
- [mind](#mind) (9 commands)
- [playbooks-core](#playbooks-core) (1 commands)
- [plugin-template](#plugin-template) (2 commands)
- [plugins](#plugins) (17 commands)
- [registry](#registry) (2 commands)
- [release](#release) (8 commands)
- [system](#system) (1 commands)
- [workflows](#workflows) (11 commands)

---

## analytics

### `kb analytics:manifest:analytics-cli`

Commands from @kb-labs/analytics-cli are unavailable

**Aliases:** `analytics manifest:analytics-cli`

---

## commit

### `kb commit:apply`

Apply current commit plan (create local commits).

Creates git commits according to the current plan. Checks for staleness (working tree changes since plan generation) unless --force is used.

**Flags:**

- `--force` (-f): Apply even if working tree changed (default: `false`)
- `--json`: Output JSON (default: `false`)

**Examples:**

```bash
kb commit apply
kb commit apply --force
```

**Aliases:** `commit apply`

---

### `kb commit:commit`

Generate and apply commits (default flow).

Analyzes changes, generates commit plan with LLM, applies commits locally. Use --dry-run to preview without applying, --with-push to push after applying.

**Flags:**

- `--scope` (-s): Filter by package name (@kb-labs/core), wildcard (@kb-labs/*), or path pattern (packages/**)
- `--json`: Output JSON (default: `false`)
- `--dry-run`: Generate plan only, do not apply (default: `false`)
- `--with-push`: Push after apply (default: `false`)

**Examples:**

```bash
kb commit commit
kb commit commit --dry-run
kb commit commit --with-push
kb commit commit --scope "src/components/**"
```

**Aliases:** `commit commit`

---

### `kb commit:generate`

Generate commit plan from git changes.

Analyzes staged and unstaged changes using git diff, then uses LLM to group related changes and generate conventional commit messages.

**Flags:**

- `--scope` (-s): Filter by package name (@kb-labs/core), wildcard (@kb-labs/*), or path pattern (packages/**)
- `--json`: Output JSON (default: `false`)

**Examples:**

```bash
kb commit generate
kb commit generate --json
kb commit generate --scope "packages/**"
```

**Aliases:** `commit generate`

---

### `kb commit:open`

Show current commit plan.

Displays the current commit plan if one exists.

**Flags:**

- `--json`: Output JSON (default: `false`)

**Examples:**

```bash
kb commit open
kb commit open --json
```

**Aliases:** `commit open`

---

### `kb commit:push`

Push commits to remote repository.

Pushes local commits to the remote. Refuses force push to protected branches (main, master) by default.

**Flags:**

- `--force` (-f): Force push (dangerous!) (default: `false`)
- `--json`: Output JSON (default: `false`)

**Examples:**

```bash
kb commit push
```

**Aliases:** `commit push`

---

### `kb commit:reset`

Clear current commit plan.

Removes the current commit plan from storage.

**Examples:**

```bash
kb commit reset
```

**Aliases:** `commit reset`

---

## core

### `kb core:manifest:core-cli`

Commands from @kb-labs/core-cli are unavailable

**Aliases:** `core manifest:core-cli`

---

## devlink

### `kb devlink:manifest:devlink-cli`

Commands from @kb-labs/devlink-cli are unavailable

**Aliases:** `devlink manifest:devlink-cli`

---

## docs

### `kb generate-cli-reference`

Generate CLI reference documentation from command registry

**Flags:**

- `--output`: Output file path (default: CLI-REFERENCE.md)
- `--json`: Output in JSON format

**Examples:**

```bash
docs generate-cli-reference
docs generate-cli-reference --output=./docs/CLI-REFERENCE.md
```

---

## info

### `kb diag`

Comprehensive system diagnostics (plugins, cache, environment, versions)

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb diag
kb diag --json
```

---

### `kb diagnose`

Quick environment & repo diagnosis

Performs a quick diagnosis of the current environment and repository state

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb diagnose
```

---

### `kb health`

Report overall CLI health snapshot

Shows the kb.health/1 snapshot shared with REST and Studio.

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb health
kb health --json
```

---

### `kb hello`

Print a friendly greeting

Prints a simple greeting message for testing CLI functionality

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb hello
```

---

### `kb version`

Show CLI version

Displays the current version of the KB Labs CLI

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb version
```

---

## logging

### `kb check`

Check logging configuration and test logging system

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
logging check
logging check --json
```

---

### `kb init`

Initialize logging configuration interactively

**Flags:**

- `--force`: Overwrite existing configuration

**Examples:**

```bash
logging init
logging init --force
```

---

### `kb log-test`

Comprehensive test of logging system (levels, context, redaction, etc.)

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb log-test
kb log-test --json
```

---

## mind

### `kb mind:init`

Initialize mind workspace

**Aliases:** `mind init`

---

### `kb mind:rag-index`

Build Mind knowledge indexes

**Aliases:** `mind rag-index`

---

### `kb mind:rag-query`

Run semantic RAG query

**Aliases:** `mind rag-query`

---

### `kb mind:sync-add`

Add document to sync

**Aliases:** `mind sync-add`

---

### `kb mind:sync-delete`

Delete synced document

**Aliases:** `mind sync-delete`

---

### `kb mind:sync-list`

List synced documents

**Aliases:** `mind sync-list`

---

### `kb mind:sync-status`

Show sync status

**Aliases:** `mind sync-status`

---

### `kb mind:sync-update`

Update synced document

**Aliases:** `mind sync-update`

---

### `kb mind:verify`

Verify workspace consistency

**Aliases:** `mind verify`

---

## playbooks-core

### `kb playbooks-core:manifest:playbooks-core`

Commands from @kb-labs/playbooks-core are unavailable

**Aliases:** `playbooks-core manifest:playbooks-core`

---

## plugin-template

### `kb plugin-template:hello`

Print a hello message (V3 migrated)

V3 version with improved UI, timing tracking, and structured output.

**Flags:**

- `--name` (-n): Name to greet (default: `World`)
- `--json`: Output as JSON (default: `false`)

**Examples:**

```bash
plugin-template hello # Basic greeting
plugin-template hello --name=Developer # Greet specific name
plugin-template hello --json # Output as JSON
```

**Aliases:** `plugin-template hello`

---

### `kb plugin-template:test-loader`

Test UI loader/spinner functionality (V3 migrated)

Demonstrates spinner, multi-stage progress, and rapid updates for testing UI loader components.

**Flags:**

- `--duration` (-d): Duration of each stage in milliseconds (default: `2000`)
- `--fail` (-f): Simulate failure scenario (default: `false`)
- `--stages` (-s): Number of progress stages to simulate (default: `3`)

**Examples:**

```bash
plugin-template test-loader # Basic loader test (3 stages, 2s each)
plugin-template test-loader --duration=1000 # Fast test (1s per stage)
plugin-template test-loader --fail # Simulate failure
plugin-template test-loader --stages=5 --duration=1000 # Many stages
```

**Aliases:** `plugin-template test-loader`

---

## plugins

### `kb clear-cache`

Clear CLI plugin discovery cache

**Flags:**

- `--deep`: Also clear Node.js module cache
- `--json`: Output in JSON format

**Examples:**

```bash
kb plugins clear-cache
kb plugins clear-cache --deep
```

---

### `kb commands`

Show all plugin commands with their real invocation syntax

**Flags:**

- `--json`: Output in JSON format
- `--plugin`: Filter by plugin ID
- `--sort`: Sort order: alpha (default), count, type

**Examples:**

```bash
plugins commands
plugins commands --plugin=@kb-labs/mind
plugins commands --sort=count
plugins commands --json
```

---

### `kb disable`

Disable a plugin

**Examples:**

```bash
plugins disable
```

---

### `kb discovery-test`

Test new DiscoveryManager with debug logs

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
plugins discovery-test
plugins discovery-test --json
```

---

### `kb doctor`

Diagnose plugin issues and suggest fixes

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
plugins doctor
plugins doctor --json
```

---

### `kb enable`

Enable a plugin

**Flags:**

- `--perm`: Grant specific permissions (e.g., --perm fs.write --perm net.fetch)

**Examples:**

```bash
plugins enable
plugins enable --perm=fs.write
```

---

### `kb link`

Link a local plugin for development

**Examples:**

```bash
plugins link
```

---

### `kb list`

List all discovered CLI plugins

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
plugins list
plugins list --json
```

---

### `kb plugin:validate`

Validate plugin manifest and contracts

**Flags:**

- `--manifest`: Path to manifest file (default: manifest.v2.ts) (default: `manifest.v2.ts`)
- `--contracts`: Path to contracts file for cross-validation
- `--fix`: Automatically fix common issues

---

### `kb registry`

List all REST API plugin manifests for REST API server

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
plugins registry
plugins registry --json
```

---

### `kb scaffold`

Generate a new KB CLI plugin template

**Flags:**

- `--format`: Module format: esm or cjs (default: `esm`) (choices: `esm`, `cjs`)

**Examples:**

```bash
plugins scaffold
plugins scaffold --format=cjs
```

---

### `kb telemetry`

Show telemetry metrics (requires opt-in)

**Flags:**

- `--json`: Output in JSON format
- `--clear`: Clear collected metrics

**Examples:**

```bash
plugins telemetry
plugins telemetry --json
plugins telemetry --clear
```

---

### `kb trust`

Promote plugin to locally trusted (no audit, at your own risk)

**Flags:**

- `--force`: Skip confirmation prompt

**Examples:**

```bash
plugins trust
plugins trust --force
```

---

### `kb trust-status`

Show plugin trust level and audit status

**Flags:**

- `--json`: Output as JSON

**Examples:**

```bash
plugins trust-status
```

---

### `kb unlink`

Unlink a local plugin

**Examples:**

```bash
plugins unlink
```

---

### `kb untrust`

Demote plugin to untrusted (Docker isolation)

**Examples:**

```bash
plugins untrust
```

---

### `kb watch`

Watch for plugin manifest changes and hot-reload

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
plugins watch
```

---

## registry

### `kb headers-debug`

Stream recent header policy decisions from the REST API debug buffer

**Flags:**

- `--json`: Output raw entries in JSON
- `--limit`: Number of recent decisions to fetch (1-200)
- `--base-url`: REST API base URL (defaults to KB_REST_BASE_URL or http://localhost:5050/api/v1)
- `--plugin`: Filter by plugin id
- `--route`: Filter by route id (e.g. GET /v1/foo)
- `--direction`: Filter by direction (inbound | outbound) (choices: `inbound`, `outbound`)
- `--dry`: Show only entries produced while KB_HEADERS_DEBUG=dry-run
- `--blocked`: Show only headers that were blocked by policy

**Examples:**

```bash
kb headers-debug
kb headers-debug --plugin=payments --blocked
kb headers-debug --dry --direction=inbound --limit=20
```

---

### `kb lint`

Validate header policies declared in REST plugin manifests

**Flags:**

- `--json`: Output JSON report
- `--strict`: Treat warnings as failures (exit 1 on warnings)

**Examples:**

```bash
registry lint
registry lint --json
registry lint --strict
```

---

## release

### `kb release:changelog`

Generate changelog from conventional commits

Parse git history and generate changelog with conventional commits support

**Flags:**

- `--scope`: Filter to specific package
- `--from`: Start commit/tag
- `--to`: End commit/tag (default: HEAD)
- `--since-tag`: Shorthand for --from <tag>
- `--format`: Output format (default: `both`) (choices: `json`, `md`, `both`)
- `--level`: Detail level (default: `standard`) (choices: `compact`, `standard`, `detailed`)
- `--template`: Template name (builtin: corporate, corporate-ai, technical, compact) or custom path
- `--breaking-only`: Show only breaking changes
- `--include`: Comma-separated types to include
- `--exclude`: Types to exclude
- `--workspace-only`: Only workspace changelog
- `--per-package`: Only per-package changelogs
- `--force`: Skip audit gate
- `--allow-major`: Allow major bumps for experimental packages
- `--preid`: Pre-release identifier (rc, beta, alpha)

**Examples:**

```bash
kb release changelog
kb release changelog --from v1.0.0
kb release changelog --format md --level detailed
kb release changelog --template corporate-ai
kb release changelog --template ./my-template.ts
kb release changelog --breaking-only
```

**Aliases:** `release changelog`

---

### `kb release:plan`

Analyze changes and prepare release plan

Detect modified packages and compute version bumps based on changes

**Flags:**

- `--scope`: Package scope (glob pattern)
- `--bump`: Version bump strategy (default: `auto`) (choices: `patch`, `minor`, `major`, `auto`)
- `--json`: Print plan as JSON

**Examples:**

```bash
kb release plan
kb release plan --scope packages/*
kb release plan --bump minor
kb release plan --json
```

**Aliases:** `release plan`

---

### `kb release:preview`

Preview release plan without making changes

Show release plan with bump table and changelog preview

**Flags:**

- `--md`: Print markdown preview

**Examples:**

```bash
kb release preview
kb release preview --md
```

**Aliases:** `release preview`

---

### `kb release:publish`

Publish packages to npm registry with interactive OTP

Smart npm publish with interactive 2FA support and better UX

**Flags:**

- `--scope`: Package scope (glob pattern)
- `--otp`: One-time password (optional, will prompt if needed)
- `--dry-run`: Simulate publish without actually publishing
- `--tag`: NPM dist-tag (default: latest)
- `--access`: Package access level (choices: `public`, `restricted`)
- `--json`: Output in JSON format

**Examples:**

```bash
kb release publish
kb release publish --scope @kb-labs/core
kb release publish --otp 123456
kb release publish --dry-run
kb release publish --tag next --access public
```

**Aliases:** `release publish`

---

### `kb release:report`

Show last release report

Display the most recent release execution report

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb release report
kb release report --json
```

**Aliases:** `release report`

---

### `kb release:rollback`

Rollback last release

Restore workspace state from backup snapshot

**Flags:**

- `--json`: Output in JSON format

**Examples:**

```bash
kb release rollback
kb release rollback --json
```

**Aliases:** `release rollback`

---

### `kb release:run`

Execute release process (plan, check, publish)

Run full release: plan versions, run checks, publish packages

**Flags:**

- `--scope`: Package scope (glob pattern)
- `--strict`: Fail on any check failure
- `--dry-run`: Simulate release without publishing
- `--skip-checks`: Skip pre-release checks
- `--json`: Print result as JSON

**Examples:**

```bash
kb release run
kb release run --dry-run
kb release run --strict --json
kb release run --scope packages/core
```

**Aliases:** `release run`

---

### `kb release:verify`

Validate release readiness

Check if repo has substantial changes for release

**Flags:**

- `--fail-if-empty`: Fail if no version bumps needed
- `--fail-on-breaking`: Fail if breaking changes detected
- `--allow-types`: Comma-separated types required (e.g., feat,fix)

**Examples:**

```bash
kb release verify
kb release verify --fail-if-empty
kb release verify --allow-types feat,fix
```

**Aliases:** `release verify`

---

## system

### `kb plugins:introspect`

Introspect plugin manifest and generate artifacts

---

## workflows

### `kb cancel`

Cancel an in-flight workflow run

**Flags:**

- `--json`: Output result as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F
kb wf cancel 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json
```

**Aliases:** `wf:cancel`

---

### `kb init`

Initialize a new workflow

**Flags:**

- `--id`: Workflow ID (filename without extension) **(required)**
- `--template`: Template to use **(required)** (choices: `ai-ci-standard`, `nested-workflow`, `empty`)
- `--dir`: Output directory (default: `.kb/workflows`)

**Examples:**

```bash
kb wf init --id my-workflow --template empty
kb wf init --id ai-ci --template ai-ci-standard
```

**Aliases:** `wf:init`

---

### `kb logs`

Stream workflow run events and logs

**Flags:**

- `--follow`: Continue streaming logs until interrupted
- `--json`: Output events as JSON (disabled with --follow)
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F
kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --follow
kb wf logs 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json
```

**Aliases:** `wf:logs`, `wf:runs:logs`

---

### `kb marketplace:add`

Add a remote marketplace source

**Flags:**

- `--name`: Marketplace name **(required)**
- `--url`: Git repository URL **(required)**
- `--ref`: Branch or tag (default: main)
- `--path`: Subdirectory path in repo
- `--json`: Output as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf marketplace:add --name kb-labs-official --url https://github.com/kb-labs/workflows
kb wf marketplace:add --name my-workflows --url https://github.com/user/repo --ref v1.0.0
```

**Aliases:** `wf:marketplace:add`

---

### `kb marketplace:list`

List configured remote marketplace sources

**Flags:**

- `--json`: Output as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf marketplace:list
kb wf marketplace:list --json
```

**Aliases:** `wf:marketplace:list`

---

### `kb marketplace:remove`

Remove a remote marketplace source

**Flags:**

- `--name`: Marketplace name to remove **(required)**
- `--json`: Output as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf marketplace:remove --name kb-labs-official
```

**Aliases:** `wf:marketplace:remove`

---

### `kb marketplace:update`

Update a remote marketplace source (refetch from git)

**Flags:**

- `--name`: Marketplace name to update (all if not specified)
- `--json`: Output as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf marketplace:update
kb wf marketplace:update --name kb-labs-official
```

**Aliases:** `wf:marketplace:update`

---

### `kb replay`

Replay a workflow run from a snapshot

**Flags:**

- `--from-step`: Start replay from a specific step ID
- `--json`: Output as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf replay <runId>
kb wf replay <runId> --from-step step-123
kb wf replay <runId> --json
```

**Aliases:** `wf:replay`

---

### `kb runs get`

Show details for a workflow run

**Flags:**

- `--json`: Output run details as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F
kb wf runs get 01HFYQ7C9X1Y2Z3A4B5C6D7E8F --json
```

**Aliases:** `wf:runs:get`

---

### `kb runs list`

List recent workflow runs

**Flags:**

- `--status`: Filter by status (queued|running|success|failed|cancelled|skipped)
- `--limit`: Maximum number of runs to return (default 20)
- `--json`: Output results as JSON
- `--verbose`: Enable verbose logging

**Examples:**

```bash
kb wf runs list
kb wf runs list --status running
kb wf runs list --limit 5 --json
```

**Aliases:** `wf:runs:list`

---

### `kb validate`

Validate a workflow specification (YAML or JSON)

**Flags:**

- `--file`: Path to workflow specification file
- `--inline`: Inline workflow specification (JSON or YAML)
- `--stdin`: Read workflow specification from STDIN
- `--json`: Output validation result as JSON
- `--verbose`: Print verbose logs

**Examples:**

```bash
kb wf validate --file ./kb.workflow.yml
kb wf validate --inline '{"name":"demo","on":{"manual":true},"jobs":{}}'
cat kb.workflow.yml | kb wf validate --stdin
```

**Aliases:** `wf:validate`

---
