#!/usr/bin/env node
// Step: Post audit delta to PR — shows before/after for any review loop
// Env: PR_NUMBER, OWNER, REPO, AUDIT_TYPE, PREV_COUNT, CURR_COUNT, CURR_VERDICT, CURR_SUMMARY
import { ghComment } from './lib/kb.mjs';

const { PR_NUMBER, OWNER, REPO, AUDIT_TYPE, CURR_VERDICT, CURR_SUMMARY } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;
const prev = process.env.PREV_COUNT || '0';
const curr = process.env.CURR_COUNT || '0';

let icon, status, delta;
if (CURR_VERDICT === 'passed' || curr === '0') {
  icon = '✅'; status = 'Resolved'; delta = `was ${prev} → now **0**`;
} else if (CURR_VERDICT === 'deadlock') {
  icon = '🔴'; status = 'DEADLOCK — escalating to human'; delta = `was ${prev} → still ${curr} (agent made no progress)`;
} else {
  icon = '🔄'; status = 'In progress'; delta = `was ${prev} → now ${curr}`;
}

const body = `## ${icon} ${AUDIT_TYPE} Re-run — ${status}\n\n**Issues**: ${delta}\n\n${CURR_SUMMARY}`;
ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body });
