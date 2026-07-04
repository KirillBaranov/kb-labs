#!/usr/bin/env node
// Step: Open Draft PR with Plan
// Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, BASE_BRANCH, BRANCH_NAME
//
// Idempotency: if a PR already exists for BRANCH_NAME, update its body instead of
// creating a duplicate. Reopens closed PRs. Cannot reopen merged PRs — creates new.
import { run, runOut, workspaceRoot, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, BASE_BRANCH, BRANCH_NAME } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

run('git', ['add', '-f', 'PLAN.md']);
run('git', ['commit', '-m', `plan: implementation plan for issue #${ISSUE_NUMBER}`], { allowFailure: true });
run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

// Check if a PR already exists for this branch (open, closed, or merged)
const existingRaw = runOut('gh', ['pr', 'view', BRANCH_NAME, '--repo', REPO_FULL, '--json', 'number,url,state']) || '{}';
const existing = safeJson(existingRaw, {});

if (existing.state === 'OPEN') {
  run('gh', ['pr', 'edit', String(existing.number), '--repo', REPO_FULL, '--body-file', 'PLAN.md'], { allowFailure: true });
  console.log(`Updated existing open PR #${existing.number}`);
} else if (existing.state === 'CLOSED') {
  run('gh', ['pr', 'reopen', String(existing.number), '--repo', REPO_FULL], { allowFailure: true });
  run('gh', ['pr', 'edit', String(existing.number), '--repo', REPO_FULL, '--body-file', 'PLAN.md'], { allowFailure: true });
  console.log(`Reopened and updated closed PR #${existing.number}`);
} else {
  // No PR (or MERGED — need a fresh one after branch reset)
  run('gh', [
    'pr', 'create',
    '--repo', REPO_FULL,
    '--title', ISSUE_TITLE,
    '--body-file', 'PLAN.md',
    '--draft',
    '--base', BASE_BRANCH,
    '--head', BRANCH_NAME,
  ], { allowFailure: true });
}

const prJsonRaw = runOut('gh', ['pr', 'view', BRANCH_NAME, '--repo', REPO_FULL, '--json', 'number,url']);
const prJson = safeJson(prJsonRaw, {});

console.log(`Draft PR: ${prJson.url || ''}`);
emitKbOutput({ prUrl: prJson.url || '', prNumber: String(prJson.number || ''), url: prJson.url || '' });
