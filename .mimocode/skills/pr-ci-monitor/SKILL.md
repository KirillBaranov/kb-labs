---
name: pr-ci-monitor
description: Monitor GitHub PR CI status, investigate failures, download logs, and find root causes. Use when the user asks to check PR checks, investigate CI failures, or monitor CI status.
---

# PR CI Monitor

Monitor GitHub PR CI status, investigate failures, and find root causes.

## Step 1: List open PRs

```bash
gh pr list --author "@me" --state open --json number,title,headRefName,baseRefName,isDraft,mergeable,createdAt
```

## Step 2: Check CI status for a PR

```bash
gh pr checks <PR#> 2>&1
```

For a summary of failures/pending:

```bash
gh pr checks <PR#> 2>&1 | grep -E "fail|pending" | grep -v "skipping"
```

For a count summary:

```bash
echo "FAIL:" $(gh pr checks <PR#> 2>&1 | grep "\tfail\t" | grep -v "skipping" | wc -l) "PENDING:" $(gh pr checks <PR#> 2>&1 | grep "\tpending\t" | wc -l)
```

## Step 3: Investigate a failing check

Get the job ID from the failed check, then download logs:

```bash
gh run view --job <JOB_ID> --log-failed 2>&1 | tail -100
```

For full logs (large, use with grep):

```bash
gh run view --job <JOB_ID> --log 2>&1 > /tmp/job-<JOB_ID>.log
grep -nE "✕|FAIL |AssertionError|✘| × |❯ |Expected|received|Tests .*failed|exit code [1-9]" /tmp/job-<JOB_ID>.log
```

## Step 4: Wait for CI to complete

```bash
until ! gh pr checks <PR#> 2>&1 | grep -qE '\bpending\b'; do sleep 60; done
gh pr checks <PR#> 2>&1
```

## Step 5: Diagnose common failure patterns

### Flaky test (passes locally, fails in CI)
- Check if the test touches `npm.spec.ts` in devlink — known timeout issue
- Check if the test is in a file not modified by the PR — likely pre-existing

### Plugin E2E failure
- Usually aggregates from a specific e2e shard (workflows, gateway, etc.)
- Find the actual failing shard and investigate its logs

### TypeScript build error
- Run `pnpm --filter <package> build` locally to reproduce
- Check for missing imports or type mismatches

## Rules

- Always check if the failing test is in a file modified by the PR
- Download full logs for complex failures — `--log-failed` only shows the last 100 lines
- Use `grep` on full logs to find all failure markers, not just the first one
- For WebSocket test failures, check gateway WS configuration
- For timeout failures, check if the test is flaky (runs on main too)
