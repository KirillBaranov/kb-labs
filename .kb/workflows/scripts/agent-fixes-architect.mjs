#!/usr/bin/env node
// Step: Agent Fixes Architect Blockers
// Env: ISSUE_NUMBER, ISSUE_TITLE, ARCHITECT_REVIEW, IMPL_SESSION_ID
import { workspaceRoot, callClaude, parseClaudeJson, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, ARCHITECT_REVIEW, IMPL_SESSION_ID } = process.env;

const prompt = `The architect reviewed your implementation and found blockers that must be fixed. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Architect findings:
${ARCHITECT_REVIEW}

Instructions:
1. Fix every blocker listed by the architect.
2. Do NOT change anything unrelated to the findings.
3. After fixing, self-verify:
   - Run kb-devkit run build --affected to confirm it still compiles.
   - Run tests for affected packages.
   - Re-read your changes and confirm the architectural concern is actually addressed.
   - Only finish when you are confident the blockers are resolved.
4. Do NOT commit — just fix the code.
End with a summary of what you fixed and how you confirmed the architectural concerns are addressed.`;

const res = callClaude({ prompt, resume: IMPL_SESSION_ID || undefined, outputFormat: 'json', mergeStderr: true });
const { result: summary } = parseClaudeJson(res.stdout);

console.log(summary);
emitKbOutput({ summary: summary.slice(-2000) });
