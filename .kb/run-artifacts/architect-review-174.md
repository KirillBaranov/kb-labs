## Verdict
NEEDS_FIXES

## Summary
The core `runs cancel` implementation (committed in `0451ceb0`) appears structurally sound and consistent with existing patterns. However, the current diff introduces two blockers that must not merge: a real GitHub OAuth token committed to `settings.json`, and a destructive force-reset behavior change in `create-branch.ts` that is unrelated to issue #174. Additionally, `buildShellSafeCommand` — a legitimately valuable security fix — is implemented and tested but never wired into the execution path, leaving the shell injection vulnerability open in production.

## Findings

- **[BLOCKER]** `GITHUB_WORKFLOW_TOKEN: "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"` is a live GitHub OAuth token hardcoded in `.claude/settings.json`. This file is tracked in git and will be pushed. Revoke the token immediately, remove the value from the file, and supply it via a gitignored `.env` or a local settings override (e.g. `settings.local.json`).

- **[BLOCKER]** `create-branch.ts`: when a branch already exists, the old code returned the existing SHA (non-destructive — continues from current tip). The new code force-resets the branch to the base SHA, silently discarding any commits already on it. This is a **destructive behavioral change** with no linked issue, no ADR, and no test covering the data-loss scenario. It is also completely unrelated to issue #174. Revert or split into a dedicated PR with explicit rationale.

- **[WARNING]** `buildShellSafeCommand` is implemented in `expressions.ts` and has good test coverage, but there is no call site in the diff — no worker, step-runner, or execution path actually uses it. The shell injection vulnerability (`${{ }}` raw substitution in `run:` blocks) is still exploitable in production. Either wire it up in this PR or open a follow-up issue and track it explicitly.

- **[WARNING]** Significant scope creep: `buildShellSafeCommand` (security fix), `create-branch.ts` (destructive behavior change), `devservices.dev.yaml` env wiring, and `lock.json` timestamp are all bundled into an "Add runs cancel command" PR. Each should ship as its own PR to keep history readable and blast radius small.

- **[SUGGESTION]** The `captured.error` → `captured.errors` and `captured.warning` → `captured.warnings` fixes in `runs-cancel.cli.test.ts` look correct, but they silently fix a property-name bug in the test harness API. This should be called out explicitly in the commit message so the API contract is visible.

- **[SUGGESTION]** `buildShellSafeCommand` uses dot-to-underscore replacement (`expr.trim().replace(/[^a-zA-Z0-9_]/g, '_')`), which can produce collisions: `steps.a.b` and `steps_a_b` both map to `_WF_steps_a_b`. Low probability but worth a note or a uniqueness guard.

## Conclusion

Two blockers must be resolved before merge:
1. Revoke and remove the hardcoded GitHub token from `settings.json`.
2. Revert the `create-branch.ts` force-reset change or move it to a separate PR with a documented rationale and a test.

`buildShellSafeCommand` should either be wired into the execution path in this PR or explicitly tracked as a follow-up — shipping an unused security utility with no call site gives false confidence that the injection is fixed.

::kb-output::{"verdict":"NEEDS_FIXES","blockers_count":2,"review":"The core runs cancel implementation appears structurally sound. However, a live GitHub OAuth token is hardcoded in settings.json, and create-branch.ts introduces a destructive force-reset behavior change unrelated to issue #174. buildShellSafeCommand is tested but never wired up."}