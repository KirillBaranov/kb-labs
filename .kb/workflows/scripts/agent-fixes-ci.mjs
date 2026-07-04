#!/usr/bin/env node
// Step: Agent Fixes CI Failures
// Env: ISSUE_NUMBER, BRANCH_NAME, IMPL_SESSION_ID, CI_LOGS_FILE, OWNER, REPO
import { workspaceRoot, run, runOut, readFileOrEmpty, callClaude } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, BRANCH_NAME, IMPL_SESSION_ID, CI_LOGS_FILE, OWNER, REPO } = process.env;

let diffStat = runOut('git', ['diff', 'HEAD~1', '--stat']);
if (!diffStat) diffStat = runOut('git', ['diff', '--stat']);

const logs = readFileOrEmpty(CI_LOGS_FILE);

const prompt = `GitHub CI failed on your implementation. You must fix it.

Working directory: ${process.cwd()}

Your changes in this PR:
${diffStat}

CI failure logs:
${logs}

Instructions:
1. Read the logs carefully — identify the exact file and line that failed.
2. Cross-reference with your changes (git diff HEAD~1 shows what you added).
3. For detailed logs: gh run list --repo ${OWNER}/${REPO} --branch ${BRANCH_NAME} --limit 5
   Then: gh run view <id> --repo ${OWNER}/${REPO} --log-failed
4. Fix the root cause. Do NOT suppress errors with eslint-disable or @ts-ignore.
5. Do NOT commit — just fix the code.
6. End with: what failed, what you changed to fix it.`;

callClaude({ prompt, resume: IMPL_SESSION_ID || undefined, outputFormat: 'json', mergeStderr: true });

// Commit fixes and push
run('git', ['add', '-A']);
const staged = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
if (staged.status !== 0) {
  run('git', ['commit', '-m', `fix: CI failures for issue #${ISSUE_NUMBER}`]);
  run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);
} else {
  console.log('No changes from CI fix agent.');
}
