#!/usr/bin/env node
// Step: Agent Fixes QA Bugs
// Env: ISSUE_NUMBER, ISSUE_TITLE, QA_REPORT, IMPL_SESSION_ID
import { workspaceRoot, callClaude, parseClaudeJson, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, QA_REPORT, IMPL_SESSION_ID } = process.env;

const prompt = `The adversarial QA agent found bugs in your implementation. Fix them. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

QA findings:
${QA_REPORT}

Instructions:
1. Fix every bug marked critical or major.
2. Do NOT change anything unrelated to the findings.
3. After fixing, self-verify by reproducing the exact attack from the QA report:
   - Start relevant services if needed.
   - Run the exact commands from the QA report that triggered the bug.
   - Confirm the bug no longer reproduces.
   - Run tests for affected packages.
   - Only finish when you have personally confirmed the bugs are fixed.
4. Do NOT commit — just fix the code.
End with: what was broken, how you fixed it, and exact verification steps you ran.`;

const res = callClaude({ prompt, resume: IMPL_SESSION_ID || undefined, outputFormat: 'json', mergeStderr: true });
const { result: summary } = parseClaudeJson(res.stdout);

console.log(summary);
emitKbOutput({ summary: summary.slice(-2000) });
