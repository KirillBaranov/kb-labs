#!/usr/bin/env node
// Step: Post Architect Review → Fixes summary to PR
// Only runs when architect found blockers and agent fixed them.
// Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, ARCHITECT_FIX_SUMMARY
import { readFileOrEmpty, ghComment } from './lib/kb.mjs';

const { ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, ARCHITECT_FIX_SUMMARY } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const fullReview = readFileOrEmpty(`.kb/run-artifacts/architect-review-${ISSUE_NUMBER}.md`);
const lines = fullReview.split('\n');
const findingsIdx = lines.findIndex((l) => l.includes('## Findings'));
const review = findingsIdx === -1 ? '' : lines.slice(findingsIdx, findingsIdx + 30).join('\n');

const parts = ['## 🏛️ Architecture Review → Addressed'];
if (review) {
  parts.push('', '**Architect findings:**', '', '```', review, '```');
}
parts.push('', '**Fixed by developer agent:**', '', ARCHITECT_FIX_SUMMARY || '', '', '---', '*Developer Agent — addressed all architecture blockers*');

ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body: parts.join('\n') });
