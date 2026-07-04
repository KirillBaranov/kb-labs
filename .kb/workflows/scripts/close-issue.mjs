#!/usr/bin/env node
// Step: Close Issue
// Env: ISSUE_NUMBER, OWNER, REPO, CLICKUP_TASK_ID (optional)
import { run } from './lib/kb.mjs';

const { ISSUE_NUMBER, OWNER, REPO, CLICKUP_TASK_ID } = process.env;

run('gh', ['issue', 'close', ISSUE_NUMBER, '--repo', `${OWNER}/${REPO}`], { allowFailure: true });

if (CLICKUP_TASK_ID) {
  run('pnpm', ['--silent', 'kb', 'clickup', 'task', 'update', CLICKUP_TASK_ID, '--status', 'complete', '--yes'], { allowFailure: true });
  console.log(`ClickUp task ${CLICKUP_TASK_ID} marked complete`);
}
