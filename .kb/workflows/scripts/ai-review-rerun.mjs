#!/usr/bin/env node
// Step: AI Review Re-run — re-run review after agent fix, detect deadlock
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workspaceRoot, runOut, callClaude, parseKbOutputLine, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, PREV_CODE_HASH, PREV_FINDINGS_HASH } = process.env;
const artifactsDir = '.kb/run-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const diff = runOut('git', ['diff', 'HEAD', '--stat']);
const files = runOut('git', ['diff', '--name-only', 'HEAD']);

const prompt = `You are a code reviewer re-checking a fix. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

The agent has made fixes based on previous review feedback.

Changed files:
${files}

Diff stat:
${diff}

Working directory: ${process.cwd()}

Review the current implementation for correctness, completeness, and code quality.
Focus on whether the previously reported issues have been resolved.

Output a short review and end with exactly:
::kb-output::{"passed":true|false,"issues_count":N,"issues":"<one-line summary of remaining issues or empty>","summary":"<2-3 sentence summary>"}`;

const res = callClaude({ prompt, outputFormat: 'text', noSessionPersistence: true });
const reviewText = res.stdout;

// Anchor to the final `::kb-output::` line rather than scanning the whole free-text
// review, which may contain matching-looking substrings earlier in the model's prose.
const parsed = parseKbOutputLine(reviewText) || {};
const passed = parsed.passed === true;
const issuesCount = Number(parsed.issues_count) || 0;
const issues = parsed.issues || '';
let summary = parsed.summary || '';

const currCodeHash = createHash('sha256').update(runOut('git', ['diff', 'HEAD'])).digest('hex');
const currFindingsHash = createHash('sha256').update(`${issuesCount}:${issues}`).digest('hex');

let decision = 'still_issues';
if (passed || issuesCount === 0) {
  decision = 'passed';
} else if (PREV_CODE_HASH && currCodeHash === PREV_CODE_HASH && PREV_FINDINGS_HASH && currFindingsHash === PREV_FINDINGS_HASH) {
  decision = 'deadlock';
  summary = 'DEADLOCK: agent produced identical code with identical findings. Human review required.';
}

writeFileSync(`${artifactsDir}/review-rerun-${ISSUE_NUMBER}.md`, reviewText);

emitKbOutput({ decision, issues_count: issuesCount, codeHash: currCodeHash, findingsHash: currFindingsHash, summary: summary.trim() });
