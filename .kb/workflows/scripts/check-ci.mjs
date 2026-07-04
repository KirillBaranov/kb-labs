#!/usr/bin/env node
// Step: Check CI Status
// Env: OWNER, REPO, PR_NUMBER, BRANCH_NAME
//      CI_TIMEOUT_SECONDS  — wall-clock timeout before declaring stuck (default: 3600)
//      CI_MIN_CHECKS       — minimum checks expected before declaring "passed" (default: 1)
// Returns: passed | pending | fix_needed
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { runOut, workspaceRoot, emitKbOutput } from './lib/kb.mjs';

const { OWNER, REPO, PR_NUMBER, BRANCH_NAME } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;
const LOGS_FILE = `/tmp/kb-ci-logs-${PR_NUMBER}.txt`;
const TIMEOUT = Number(process.env.CI_TIMEOUT_SECONDS) || 3600;
const MIN_CHECKS = Number(process.env.CI_MIN_CHECKS) || 1;

// Persist start time across gate retries via a temp file keyed by PR
const START_FILE = `/tmp/kb-ci-start-${PR_NUMBER}.txt`;
if (!existsSync(START_FILE)) {
  writeFileSync(START_FILE, String(Math.floor(Date.now() / 1000)));
}
const startTime = Number(readFileSync(START_FILE, 'utf8').trim());
const now = Math.floor(Date.now() / 1000);
const elapsed = now - startTime;

console.log(`Checking CI for PR #${PR_NUMBER} (branch: ${BRANCH_NAME}, elapsed: ${elapsed}s / timeout: ${TIMEOUT}s)...`);

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function clearStart() {
  try { unlinkSync(START_FILE); } catch { /* already gone */ }
}

function collectLogsForFailedRun(limit) {
  const runsRaw = runOut('gh', ['run', 'list', '--repo', REPO_FULL, '--branch', BRANCH_NAME, '--json', 'databaseId,conclusion', '--limit', String(limit)]);
  const runs = safeJson(runsRaw, []);
  const failedRun = runs.find((r) => r.conclusion === 'failure') || runs[0];
  if (!failedRun) return false;
  const logs = runOut('gh', ['run', 'view', String(failedRun.databaseId), '--repo', REPO_FULL, '--log-failed']);
  writeFileSync(LOGS_FILE, logs.split('\n').slice(-300).join('\n'));
  return true;
}

// Conflict guard — GitHub will not queue CI if the PR has merge conflicts
const mergeable = runOut('gh', ['pr', 'view', PR_NUMBER, '--repo', REPO_FULL, '--json', 'mergeable', '--jq', '.mergeable']) || 'UNKNOWN';
if (mergeable === 'CONFLICTING') {
  console.log('PR has merge conflicts — CI will not run until resolved. Routing to conflict resolver.');
  clearStart();
  emitKbOutput({ decision: 'needs_rebase', hasLogs: false, ciLogsFile: '' });
  process.exit(0);
}

// Wall-clock timeout guard
if (elapsed > TIMEOUT) {
  console.log(`CI timeout reached after ${elapsed}s. Treating as failure to unblock pipeline.`);
  writeFileSync(LOGS_FILE, 'Timeout — collecting latest logs...\n');
  const found = collectLogsForFailedRun(3);
  if (!found) writeFileSync(LOGS_FILE, 'No CI run found.\n');
  clearStart();
  emitKbOutput({ decision: 'fix_needed', hasLogs: true, ciLogsFile: LOGS_FILE });
  process.exit(0);
}

await new Promise((r) => setTimeout(r, 15000));

// --- Get HEAD SHA for the PR branch from GitHub (authoritative source) ---
// Using the PR head directly avoids relying on the local workspace branch,
// which may be on a different branch than the PR (e.g. main workspace on main).
let sha = runOut('gh', ['pr', 'view', PR_NUMBER, '--repo', REPO_FULL, '--json', 'headRefOid', '--jq', '.headRefOid']);
if (!sha) {
  sha = runOut('gh', ['api', `repos/${REPO_FULL}/git/refs/heads/${BRANCH_NAME}`, '--jq', '.object.sha']);
}
if (!sha) {
  sha = runOut('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot() });
}
console.log(`HEAD SHA: ${sha.slice(0, 12)}...`);

if (sha) {
  const checksRaw = runOut('gh', ['api', `repos/${REPO_FULL}/commits/${sha}/check-runs`, '--paginate', '--jq', '[.check_runs[] | {name:.name, status:.status, conclusion:.conclusion}]']);
  // `--paginate` concatenates one JSON array per page back-to-back — flatten them.
  const arrays = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < checksRaw.length; i++) {
    if (checksRaw[i] === '[') depth++;
    else if (checksRaw[i] === ']') {
      depth--;
      if (depth === 0) {
        arrays.push(checksRaw.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const checks = arrays.flatMap((a) => safeJson(a, []));

  const total = checks.length;
  const pending = checks.filter((c) => c.status !== 'completed').length;
  const failed = checks.filter((c) => c.status === 'completed' && c.conclusion !== 'success' && c.conclusion !== 'neutral' && c.conclusion !== 'skipped').length;

  console.log(`commit check-runs → Total: ${total}  Pending: ${pending}  Failed: ${failed}  (min required: ${MIN_CHECKS})`);

  if (total >= MIN_CHECKS && pending === 0 && failed === 0) {
    console.log('All CI checks passed!');
    clearStart();
    emitKbOutput({ decision: 'passed', hasLogs: false, ciLogsFile: '' });
    process.exit(0);
  }

  if (failed > 0) {
    console.log(`CI failed (${failed} check(s) failed). Collecting logs...`);
    const found = collectLogsForFailedRun(5);
    if (!found) writeFileSync(LOGS_FILE, 'Failed run ID not found.\n');
    clearStart();
    emitKbOutput({ decision: 'fix_needed', hasLogs: true, ciLogsFile: LOGS_FILE });
    process.exit(0);
  }

  if (pending > 0) {
    console.log(`CI still running (${pending} pending).`);
  } else {
    console.log(`No checks yet for this commit (total: ${total}, need: ${MIN_CHECKS}). Waiting for CI to start...`);
  }
  emitKbOutput({ decision: 'pending', hasLogs: false, ciLogsFile: '' });
  process.exit(0);
}

// --- Fallback: no SHA available, use gh run list ---
console.log('SHA not available, falling back to gh run list...');
const runsRaw = runOut('gh', ['run', 'list', '--repo', REPO_FULL, '--branch', BRANCH_NAME, '--json', 'databaseId,status,conclusion', '--limit', '5']) || '[]';
const runs = safeJson(runsRaw, []);

const runsPending = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued' || r.status === 'waiting').length;
const runsFailed = runs.filter((r) => r.conclusion === 'failure').length;
const runsTotal = runs.length;

console.log(`gh run list → Total: ${runsTotal}  Pending: ${runsPending}  Failed: ${runsFailed}`);

if (runsTotal === 0 || runsPending > 0) {
  emitKbOutput({ decision: 'pending', hasLogs: false, ciLogsFile: '' });
  process.exit(0);
}

if (runsFailed === 0) {
  clearStart();
  emitKbOutput({ decision: 'passed', hasLogs: false, ciLogsFile: '' });
  process.exit(0);
}

const failedRun = runs.find((r) => r.conclusion === 'failure');
if (failedRun) {
  const logs = runOut('gh', ['run', 'view', String(failedRun.databaseId), '--repo', REPO_FULL, '--log-failed']);
  writeFileSync(LOGS_FILE, logs.split('\n').slice(-300).join('\n'));
}
clearStart();
emitKbOutput({ decision: 'fix_needed', hasLogs: true, ciLogsFile: LOGS_FILE });
