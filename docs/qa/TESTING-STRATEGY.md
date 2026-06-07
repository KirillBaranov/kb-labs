# QA Testing Strategy

How manual scenarios, bugs, and automated tests connect — and how to run the
regression before a release or a merge.

## The loop

```
manual scenario (docs/qa/scenarios/S-NNN)
        │  run it, find a bug
        ▼
bug entry (docs/qa/runs/YYYY-MM-DD.md, B-NNN)
        │  fix it
        ▼
automated test (fails before fix, passes after)   ← the regression guard
        │  link back
        ▼
scenario `automation:` field flips to e2e-done / has a test
```

Every bug fix lands with a test that **fails before the fix and passes after**
(project rule). The scenario it came from records which automated test now
guards it, so the next pre-release pass can trust the automation instead of
re-running everything by hand.

## Automation status (scenario frontmatter)

| `automation:` | meaning |
|---|---|
| `manual` | no automated test yet — must be run by hand |
| `e2e-todo` | planned, not written |
| `e2e-done` | covered by an automated test (unit/integration/e2e) |

## Coverage matrix — 2026-06 stabilization pass

Each fixed bug has a regression test. Run the package's suite to verify.

| Bug | Scenario | Fix area | Backing test | Run |
|---|---|---|---|---|
| B-001 | S-001 | kb-create LLM wizard | `internal/wizard/wizard_test.go`, `internal/scaffold/scaffold_test.go` (LLM*) | `go test ./internal/...` |
| B-013 | S-013 | scaffold manifest `path:` | `plugins/scaffold/entry/tests/v3-validity.test.ts` | `pnpm --filter @kb-labs/scaffold test` |
| B-014 | S-023 | kb-create update registry | `cmd/update_test.go` (TestResolveUpdateRegistry*) | `go test ./cmd/` |
| B-015 | S-006 | workflow spec validation | `workflow-repository.test.ts` (invalid spec) | `pnpm --filter @kb-labs/workflow-engine test` |
| B-016 | S-007 | workflow id = filename | `workflow-repository.test.ts` (id consistency) | `pnpm --filter @kb-labs/workflow-engine test` |
| B-017 | S-007 | required input validation | `workflow-host-service.test.ts` (B-017*) | `pnpm --filter @kb-labs/workflow-daemon test` |
| B-020 | S-013 | scaffold error.ts types | `v3-validity.test.ts` (type-safe) | `pnpm --filter @kb-labs/scaffold test` |
| B-021 | S-016 | reject non-entity install | `marketplace-service.spec.ts` (B-021) | `pnpm --filter @kb-labs/marketplace-core test` |
| B-025 | S-025 | clear-cache → plugins refresh | docs/scripts (no runtime test) | — |
| B-029 | S-029 | step fail → `failed` not `dlq` | `engine.test.ts` (B-029) | `pnpm --filter @kb-labs/workflow-engine test` |
| B-030 | S-029 | downstream → `cancelled` | `engine.test.ts` (B-030) | `pnpm --filter @kb-labs/workflow-engine test` |
| B-023 | S-020 | gateway auth toggle + guardrail | `auth-disabled-middleware.test.ts`, `auth-disabled-guardrail.test.ts`, `scaffold_test.go` (Gateway*) | `pnpm --filter @kb-labs/gateway-app test` |

### Reclassified — not code bugs (kept for the record)

| Bug | Why it is not a bug |
|---|---|
| B-008 | `kb-dev start` does exit 1 on failure; QA measured `$?` after a pipe |
| B-019 | CLI discovery cache auto-invalidates on marketplace.lock hash |
| B-024 | `kb-create rollback <svc>` is per-service for deployed platforms; fresh local has no releases |
| B-026 | publish ENEEDAUTH was the QA Verdaccio helper's token, not a kb-labs path |

## Running the regression

### Fast, deterministic (recommended before merge)

```bash
# TS packages touched in the stabilization pass
for p in @kb-labs/scaffold @kb-labs/marketplace-core @kb-labs/marketplace-api \
         @kb-labs/workflow-engine @kb-labs/workflow-daemon @kb-labs/gateway-app; do
  pnpm --filter "$p" test
done

# kb-create (Go)
cd tools/kb-create && go test ./...
```

### Full manual pass (pre-release, slower)

Requires a clean platform built from source and published to a local Verdaccio:

```bash
kb-devkit run build
./e2e/scripts/pack-all.sh
# start Verdaccio, publish (see e2e/docker-compose.yml / e2e/publisher/publish.sh)
kb-create my-project --registry http://localhost:4873 --platform /tmp/qa-platform
```

Then walk `docs/qa/scenarios/` and record results in a new `docs/qa/runs/<date>.md`.

## What to automate next

- Promote the `manual` scenarios with stable surfaces to `e2e-*` specs under
  `e2e/<domain>/` (workflow SSE, marketplace install, studio login).
- A small script that reads each scenario's `automation:` field and prints a
  coverage summary (how many P0/P1 are still `manual`).
- A CI job that runs the package suites above on the QA branch and posts the
  coverage summary as a PR comment.
