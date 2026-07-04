#!/usr/bin/env node
// Step: Agent Plans
// Env: ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, PLAN_FEEDBACK
import { writeFileSync } from 'node:fs';
import { workspaceRoot, callClaude, parseClaudeJson, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER = '', ISSUE_TITLE = '', ISSUE_BODY = '', PLAN_FEEDBACK = '' } = process.env;

const feedbackSection = PLAN_FEEDBACK ? `User feedback on previous plan (incorporate this):\n${PLAN_FEEDBACK}` : '';

const prompt = [
  'You are a senior engineer planning implementation of a GitHub issue. Write in English.',
  '',
  `Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`,
  '',
  'Description:',
  ISSUE_BODY,
  '',
  feedbackSection,
  'First, study the codebase (git log, grep, read relevant files) and determine whether',
  'this issue is ALREADY FULLY IMPLEMENTED in the current codebase or commit history.',
  '',
  'Output format — two parts, no exceptions:',
  '',
  'PART 1 (first line only):',
  '  If already fully done: PIPELINE_STATUS: ALREADY_IMPLEMENTED',
  '  If work is needed:     PIPELINE_STATUS: NEEDS_IMPLEMENTATION',
  '',
  'PART 2 (remaining lines): The implementation plan in Markdown:',
  '',
  '## Summary',
  '(1-2 sentences what needs to be done, or "Already implemented — no action needed.")',
  '',
  '## Root cause / context',
  '(brief analysis)',
  '',
  '## Implementation steps',
  '(numbered list: file paths, what to add/change; or empty if already done)',
  '',
  '## Tests / verification',
  '(how to verify the fix works)',
].join('\n');

// claude may exit 1 on first invocation in daemon context (init/warmup race) — retry
let claudeOk = false;
let res;
for (let attempt = 1; attempt <= 3; attempt++) {
  res = callClaude({ prompt, viaStdin: true, outputFormat: 'json' });
  if (res.status === 0) { claudeOk = true; break; }
  console.log(`claude attempt ${attempt} failed (exit ${res.status}), retrying...`);
  await new Promise((r) => setTimeout(r, 3000));
}

if (!claudeOk) {
  console.log('claude failed after 3 attempts');
  process.exit(1);
}

const { result: rawText, sessionId } = parseClaudeJson(res.stdout);

// Parse PIPELINE_STATUS from first line; strip it so PLAN.md contains only the Markdown.
const lines = rawText.split('\n');
const first = lines[0] || '';
const alreadyImplemented = first.includes('ALREADY_IMPLEMENTED');
const planText = alreadyImplemented ? lines.slice(1).join('\n').replace(/^\n+/, '') : rawText;

writeFileSync('PLAN.md', planText);
console.log('=== PLAN ===');
console.log(planText);
console.log(`Session: ${sessionId}`);
console.log(`Already implemented: ${alreadyImplemented}`);

emitKbOutput({ sessionId, plan: planText, alreadyImplemented: alreadyImplemented ? 'true' : 'false' });
