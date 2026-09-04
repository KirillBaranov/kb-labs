---
name: ci-diagnostics
description: Investigate a failing GitHub Actions run (CI, Affected E2E, docker-e2e zones) efficiently — start from the aggregated ci-evidence.json artifact, not raw per-job logs
globs:
  - ".github/workflows/*.yml"
  - "e2e/**"
  - "scripts/ci/**"
---

# CI failure investigation

Written after a session spent ~2 hours downloading and grepping raw
`platform-bootstrap.log` / `apply-*.log` / per-service `tmp/*.log` files from
`affected-platform-logs-*` artifacts across many Docker E2E zones — chasing a
"studio never starts" symptom through kb-dev scheduling code — when the real
root cause (`gateway` fatally crash-looping on a missing transport config)
was sitting in one line of an artifact nobody had opened yet.

## Start here, every time

Every `CI (PR)`, `Affected E2E`, and `E2E Platform Tests` run uploads a
**`ci-evidence-<run_id>`** artifact (see
`.github/workflows/reusable-ci-evidence.yml`,
`scripts/ci/ci-evidence-summary.mjs`). It already did the work you're about
to redo by hand:

- Groups every failed job by a **fingerprint** (same failure across many
  matrix/zone shards collapses into one incident, not N things to read).
- Extracts one **evidence line** per incident straight from that job's own
  GitHub Actions log (a real error/fatal/exception line near the failed
  step), not from an artifact you have to unzip.
- Tells you whether tests actually **started** (`testsStarted`) — a
  bootstrap failure vs. a real test failure are different investigations.

Fetch it first, before touching a single raw log:

```bash
RUN_ID=<failing run id>
gh api repos/<owner>/<repo>/actions/runs/$RUN_ID/artifacts \
  | python3 -c "
import json,sys
for a in json.load(sys.stdin)['artifacts']:
    if a['name'].startswith('ci-evidence-'):
        print(a['name'], a['id'])
"
gh api repos/<owner>/<repo>/actions/artifacts/<id>/zip > /tmp/ci-evidence.zip
unzip -oq /tmp/ci-evidence.zip -d /tmp/ci-evidence
cat /tmp/ci-evidence/ci-evidence.json | python3 -m json.tool
```

Read `incidents[].evidence` and `incidents[].fingerprint` first. Most of the
time this is the whole investigation — one evidence string names the actual
broken thing (a missing config key, a wrong service ID, an unresolved
dependency) with no further digging needed.

## When ci-evidence isn't enough

`ci-evidence.json`'s evidence line is one line pulled from the job's own
Actions log — it's a pointer, not a full transcript. Go deeper only if that
line doesn't already answer the question:

- **Docker E2E platform zones**: download `affected-platform-logs-*-<zone>`
  (same artifacts listing) for `platform-bootstrap.log` (full container
  startup transcript, including the `kb-create apply` JSON receipt),
  `project-kb-dir/logs/tmp/*.log` (one file per service — presence or
  absence of a service's log file is itself a strong signal: a dependent
  service with **no log file at all** means its dependency never became
  healthy, not that it failed to start), `project-kb-dir/kb.config.jsonc`
  (the actual rendered runtime config — compare it against
  `.kb/kb.config.json`'s hand-authored reference for the expected shape).
- **`kb-dev-status.json` / `kb-dev-diagnose.json`**: often just say `service
  "platform" is not running` — a dead end on their own, not worth opening
  first.

## Re-dispatching `Affected E2E` manually

```bash
gh workflow run e2e-affected.yml -f pr-number=<PR number>
```

This workflow's `discover` job **requires a PR number** — it diffs a PR's
base against its head to select which zones to run. Dispatching without
`-f pr-number=` fails immediately (`Not Found` on `pulls/0`), and dispatching
against a stale/wrong PR number silently tests an old commit instead of the
one you meant. After dispatching, always confirm before waiting 25-30
minutes for it:

```bash
sleep 8
RUN_ID=$(gh run list --workflow="Affected E2E" --limit 1 --json databaseId -q '.[0].databaseId')
gh api repos/<owner>/<repo>/actions/runs/$RUN_ID \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['head_sha'], d['status'])"
```

Compare `head_sha` against the commit you just merged — a `workflow_run`
auto-trigger fired by an unrelated PR's own CI completing can race your
manual dispatch and silently test the wrong commit.
