#!/usr/bin/env node
// Step: Agent Fixes Review Blockers
// Env: ISSUE_NUMBER, ISSUE_TITLE, REVIEW_ISSUES, IMPL_SESSION_ID
import { workspaceRoot, callClaude, parseClaudeJson } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, REVIEW_ISSUES, IMPL_SESSION_ID } = process.env;

const prompt = `The AI code review found blocking issues in your implementation. Fix them now. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Review findings:
${REVIEW_ISSUES}

Instructions:
1. Fix every blocker and high severity issue listed above.
2. Do NOT change anything unrelated to the findings.
3. After fixing, self-verify:
   - Run kb-devkit run build --affected to confirm it still compiles.
   - Run tests for affected packages to confirm nothing broke.
   - Only finish when you are confident the issues are resolved.
4. Do NOT commit — just fix the code.
End with a summary of what you fixed and how you confirmed the fixes work.`;

const res = callClaude({ prompt, resume: IMPL_SESSION_ID || undefined, outputFormat: 'json', mergeStderr: true });
const { result: summary } = parseClaudeJson(res.stdout);

console.log(summary);
