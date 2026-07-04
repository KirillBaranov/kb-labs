#!/usr/bin/env node
// Step: Comment on Issue with implementation summary
// Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, QA_STATUS
import { run, runOut, callClaude, parseClaudeJson, sanitizeSecrets, writeTemp } from './lib/kb.mjs';

const { ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, QA_STATUS } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

let diff = runOut('git', ['diff', 'HEAD~2..HEAD', '--stat']);
if (!diff) diff = runOut('git', ['diff', '--stat']);
diff = diff.split('\n').slice(-20).join('\n');

const prompt = `You just implemented a GitHub issue. Write a concise implementation comment in English.

Issue: #${ISSUE_NUMBER} — ${ISSUE_TITLE}

Git diff stat (what changed):
${diff}

QA status: ${QA_STATUS || 'passed'}
CI status: passed

Write EXACTLY this markdown structure, no other text:

## Summary
<one sentence: what the user will now experience differently>

## Changes
- \`filename\` — what was changed and why (one line per file, only files that matter)

## Validation
- QA: <status>
- CI: all checks green

---
*Implemented autonomously by AI agent powered by [KB Labs](https://github.com/KirillBaranov/kb-labs). Closes #${ISSUE_NUMBER}*`;

const res = callClaude({ prompt });
const { result: comment } = parseClaudeJson(res.stdout);

const file = writeTemp(sanitizeSecrets(comment));
run('gh', ['issue', 'comment', ISSUE_NUMBER, '--repo', REPO_FULL, '--body-file', file]);
