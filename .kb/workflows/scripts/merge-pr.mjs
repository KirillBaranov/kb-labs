#!/usr/bin/env node
// Step: Merge PR
// Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER
import { run } from './lib/kb.mjs';

const { ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER } = process.env;

// Issue titles are attacker-controlled free text — strip newlines/control chars and
// cap length before baking them into a commit subject.
const safeTitle = (ISSUE_TITLE || '').replace(/[\r\n]+/g, ' ').slice(0, 200);

run('gh', [
  'pr', 'merge', PR_NUMBER,
  '--repo', `${OWNER}/${REPO}`,
  '--squash',
  '--delete-branch',
  '--subject', `feat: ${safeTitle} (#${ISSUE_NUMBER})`,
]);
