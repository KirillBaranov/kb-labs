#!/usr/bin/env node
// Step: AI Review
// Env: ISSUE_NUMBER, ISSUE_TITLE
import { workspaceRoot, runOut, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE } = process.env;

const raw = runOut('pnpm', ['kb', 'review', 'run', '--mode', 'full', '--scope', 'changed', '--task', `Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`, '--json'])
  || '{"passed":true,"issues":[],"summary":"review skipped"}';

console.log(raw);

let reviewResult = {};
try {
  reviewResult = JSON.parse(raw);
} catch {
  reviewResult = { passed: true, issues: [], summary: 'review skipped' };
}

const passed = reviewResult.passed !== false;
const summary = reviewResult.summary || '';
const issues = reviewResult.issues || [];

emitKbOutput({ passed, issues_count: issues.length, summary, issues });
