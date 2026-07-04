#!/usr/bin/env node
// Step: Post QA Findings → Fixes summary to PR
// Only runs when adversarial QA found bugs and agent fixed them.
// Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, QA_FIX_SUMMARY
import { readFileOrEmpty, ghComment } from './lib/kb.mjs';

const { ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, QA_FIX_SUMMARY } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const fullReport = readFileOrEmpty(`.kb/run-artifacts/qa-report-${ISSUE_NUMBER}.md`);
const lines = fullReport.split('\n');
const findingsIdx = lines.findIndex((l) => l.includes('## Findings'));
const findings = findingsIdx === -1 ? '' : lines.slice(findingsIdx, findingsIdx + 40).join('\n');

const parts = ['## 🔴 QA Findings → Fixed'];
if (findings) parts.push('', '**Bugs found by adversarial QA:**', '', findings);
parts.push('', '**Fixed by developer agent:**', '', QA_FIX_SUMMARY || '', '', '---', '*Developer Agent — addressed all QA findings*');

ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body: parts.join('\n') });
