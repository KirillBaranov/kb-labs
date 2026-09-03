#!/usr/bin/env node
// Step: Resolve Conflicts
// Checks if PR has merge conflicts with base branch and auto-resolves them.
// Garbage runtime files (.kb/run-artifacts/, .kb/review/, .kb/qa/snapshots/, .mimocode/)
// are untracked. Real code conflicts are left for the agent (exits with needs_agent=true).
//
// Env: OWNER, REPO, PR_NUMBER, BRANCH_NAME, BASE_BRANCH
import { workspaceRoot, run, runOut, emitKbOutput } from './lib/kb.mjs';

const { OWNER, REPO, PR_NUMBER, BRANCH_NAME, BASE_BRANCH } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const mergeable = runOut('gh', ['pr', 'view', PR_NUMBER, '--repo', REPO_FULL, '--json', 'mergeable', '--jq', '.mergeable']);
console.log(`PR #${PR_NUMBER} mergeable: ${mergeable}`);

if (mergeable !== 'CONFLICTING') {
  console.log('No conflicts — skipping.');
  emitKbOutput({ resolved: false, needs_agent: false });
  process.exit(0);
}

console.log(`Conflicts detected. Attempting auto-merge with origin/${BASE_BRANCH}...`);

const ws = workspaceRoot();
process.chdir(ws);

run('git', ['fetch', 'origin'], { allowFailure: true });

const GARBAGE_PATTERN = /^\.kb\/review\/|^\.kb\/qa\/snapshots\/|^\.kb\/run-artifacts\/|^\.mimocode\//;

const merge = run('git', ['merge', `origin/${BASE_BRANCH}`, '--no-edit'], { allowFailure: true });
if (merge.status === 0) {
  console.log('Merge succeeded cleanly.');
} else {
  console.log('Merge has conflicts. Checking which files...');
  const unresolved = runOut('git', ['ls-files', '-u']);
  const conflictFiles = [...new Set(unresolved.split('\n').map((l) => l.split(/\s+/)[3]).filter(Boolean))].sort();
  console.log('Conflicting files:');
  console.log(conflictFiles.join('\n'));

  const codeConflicts = conflictFiles.filter((f) => !GARBAGE_PATTERN.test(f));

  if (codeConflicts.length > 0) {
    console.log('Real code conflicts found — agent needed:');
    console.log(codeConflicts.join('\n'));
    run('git', ['merge', '--abort'], { allowFailure: true });
    emitKbOutput({ resolved: false, needs_agent: true, conflicts: codeConflicts });
    process.exit(0);
  }

  // Only garbage conflicts — resolve by untracking them
  console.log('Only garbage runtime files conflict — untracking...');
  for (const f of conflictFiles.filter((f) => GARBAGE_PATTERN.test(f))) {
    run('git', ['rm', '--cached', f], { allowFailure: true });
  }

  // Verify no more conflicts
  const remaining = runOut('git', ['ls-files', '-u']).split('\n').filter(Boolean).length;
  if (remaining > 0) {
    console.log('Unexpected conflicts remain after garbage cleanup.');
    run('git', ['merge', '--abort'], { allowFailure: true });
    emitKbOutput({ resolved: false, needs_agent: true, conflicts: ['unknown'] });
    process.exit(0);
  }
}

// Remove all tracked garbage files (gitignored but previously committed)
run('git', ['rm', '--cached', '-r', '.kb/review/', '.kb/qa/snapshots/', '.kb/run-artifacts/', '.mimocode/'], { allowFailure: true });

// Commit the merge
const cachedDiff = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
const status = runOut('git', ['status']);
if (cachedDiff.status !== 0) {
  run('git', ['commit', '--no-edit', '-m', `chore: merge ${BASE_BRANCH}, remove garbage runtime artifacts`], { allowFailure: true });
} else if (/^M|All conflicts fixed/m.test(status)) {
  run('git', ['merge', '--continue', '--no-edit'], { allowFailure: true });
}

// Push
run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force'], { allowFailure: true });
console.log('Conflicts resolved and pushed.');
emitKbOutput({ resolved: true, needs_agent: false });
