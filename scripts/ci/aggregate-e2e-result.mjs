#!/usr/bin/env node
// Aggregate the per-shard outcomes of "E2E Platform Tests" into a single
// pass/fail for the branch-protection check ("Platform E2E").
//
// Why this exists
// ───────────────
// E2E Platform Tests triggers via `workflow_run` after CI / Release Binaries
// complete. When the upstream workflow did NOT succeed, every shard is gated
// out by `if: github.event.workflow_run.conclusion == 'success'` and reports
// the GitHub result `skipped` — the E2E suites never executed.
//
// The previous aggregator did `if [ e2e = success ] && [ mcp = success ]`,
// which treated `skipped` identically to `failure`. The result: every time CI
// was red on main (for any unrelated reason — coverage flake, kb-create e2e,
// …) the E2E check ALSO went red, with the misleading message "At least one
// E2E shard did not succeed", even though no shard ever ran. That false red is
// pure noise — the CI failure is the real, already-visible signal.
//
// Correct semantics
// ─────────────────
//   success   → a shard ran and passed
//   skipped   → upstream gate kept E2E from running (NOT an E2E failure)
//   failure   → a shard actually ran and failed                → block
//   cancelled → a shard was cancelled mid-run                  → block
//   <unknown> → defensive: treat as a failure                  → block
//
// The check is green when every shard is success or skipped, and red only when
// a shard genuinely failed or was cancelled.

/**
 * @param {Record<string, string>} results map of shard name → GitHub job result
 * @returns {{ ok: boolean, reason: string }}
 */
export function evaluate(results) {
  const PASS = new Set(['success', 'skipped']);
  const entries = Object.entries(results);

  const bad = entries.filter(([, r]) => !PASS.has(r));
  if (bad.length > 0) {
    const detail = bad.map(([name, r]) => `${name}=${r || '<none>'}`).join(', ');
    return {
      ok: false,
      reason: `E2E shard(s) did not succeed: ${detail}`,
    };
  }

  const allSkipped = entries.length > 0 && entries.every(([, r]) => r === 'skipped');
  if (allSkipped) {
    return {
      ok: true,
      reason:
        'E2E shards were skipped — upstream CI did not succeed, so the suites ' +
        'did not run. This is not an E2E failure; CI reports the real status.',
    };
  }

  const summary = entries.map(([name, r]) => `${name}=${r}`).join(', ');
  return { ok: true, reason: `All E2E shards passed (${summary}).` };
}

// CLI: `aggregate-e2e-result.mjs <e2e-result> <mcp-result>`
// Kept positional + named so it is trivial to call from the workflow.
function main(argv) {
  const [e2e, mcp] = argv;
  const { ok, reason } = evaluate({ e2e, mcp });
  if (ok) {
    console.log(reason);
    process.exit(0);
  }
  console.error(`::error::${reason}`);
  process.exit(1);
}

// Only run as a CLI when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
