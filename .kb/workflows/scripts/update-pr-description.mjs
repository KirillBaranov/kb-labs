#!/usr/bin/env node
// Step: Update PR Description with final plan
// Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER
import { readFileOrEmpty, writeTemp, sanitizeSecrets, run } from './lib/kb.mjs';

const { ISSUE_NUMBER, OWNER, REPO, PR_NUMBER } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const planBody = readFileOrEmpty('PLAN.md') || 'See commits for implementation details.';
const body = `${planBody}\n\n---\n*Implemented autonomously by an AI agent powered by [KB Labs](https://github.com/KirillBaranov/kb-labs). Closes #${ISSUE_NUMBER}*`;

const file = writeTemp(sanitizeSecrets(body));
run('gh', ['pr', 'edit', PR_NUMBER, '--repo', REPO_FULL, '--body-file', file]);
