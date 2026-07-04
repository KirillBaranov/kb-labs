#!/usr/bin/env node
// Resolve task source: fetch ClickUp task and create GitHub issue, or pass through ISSUE_NUMBER directly.
// Env: CLICKUP_TASK_ID (optional), ISSUE_NUMBER (optional), OWNER, REPO
//
// Idempotency: when CLICKUP_TASK_ID is given, search for an existing issue that references
// it in the body before creating a new one. Prevents duplicate issues/branches/PRs on re-runs.
import { run, runOut, emitKbOutput } from './lib/kb.mjs';

const { OWNER, REPO, CLICKUP_TASK_ID } = process.env;
let { ISSUE_NUMBER } = process.env;

let alreadyDone = false;

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

if (CLICKUP_TASK_ID) {
  if (!/^[a-zA-Z0-9]+$/.test(CLICKUP_TASK_ID)) {
    console.error(`Invalid ClickUp task id: ${CLICKUP_TASK_ID}`);
    process.exit(1);
  }

  const taskJsonRaw = runOut('pnpm', ['--silent', 'kb', 'clickup', 'task', 'get', CLICKUP_TASK_ID, '--json']);
  const task = safeJson(taskJsonRaw, {});

  const taskName = task.name;
  const taskDesc = task.description || '';
  const taskUrl = task.url || '';

  // Search for an existing issue that references this ClickUp task in its body.
  // Checks open issues first, then closed — avoids creating duplicates on re-runs.
  const searchRaw = runOut('gh', [
    'issue', 'list', '--repo', `${OWNER}/${REPO}`, '--state', 'all',
    '--search', `"ClickUp ${CLICKUP_TASK_ID}" in:body`,
    '--json', 'number,state', '--limit', '10',
  ]) || '[]';
  const issues = safeJson(searchRaw, []);
  const open = issues.find((i) => i.state === 'OPEN');
  const closed = issues.find((i) => i.state === 'CLOSED');

  if (open) {
    ISSUE_NUMBER = String(open.number);
    console.log(`Reusing existing open issue #${ISSUE_NUMBER} for ClickUp task ${CLICKUP_TASK_ID}`);
  } else if (closed) {
    ISSUE_NUMBER = String(closed.number);
    console.log(`Issue #${ISSUE_NUMBER} for ClickUp task ${CLICKUP_TASK_ID} is already closed — task done.`);
    alreadyDone = true;
  } else {
    const issueBody = `${taskDesc}\n\n---\n_Source: [ClickUp ${CLICKUP_TASK_ID}](${taskUrl})_`;
    const issueUrl = runOut('gh', ['issue', 'create', '--repo', `${OWNER}/${REPO}`, '--title', taskName, '--body', issueBody]);

    const match = issueUrl.match(/(\d+)$/);
    if (!match) {
      console.error(`Failed to parse issue number from: ${issueUrl}`);
      process.exit(1);
    }
    ISSUE_NUMBER = match[1];

    console.log(`GitHub issue #${ISSUE_NUMBER} created from ClickUp task ${CLICKUP_TASK_ID}`);
    run('pnpm', ['--silent', 'kb', 'clickup', 'task', 'update', CLICKUP_TASK_ID, '--status', 'in progress', '--yes'], { allowFailure: true });
  }
}

emitKbOutput({ issueNumber: ISSUE_NUMBER, clickupTaskId: CLICKUP_TASK_ID || '', alreadyDone: alreadyDone ? 'true' : 'false' });
