#!/usr/bin/env node
// Step: Architect Review Re-run — re-check after agent fix, detect deadlock
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workspaceRoot, runOut, readFileOrEmpty, callClaude, parseKbOutputLine, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, PREV_CODE_HASH, PREV_FINDINGS_HASH } = process.env;
const artifactsDir = '.kb/run-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const plan = readFileOrEmpty('PLAN.md');
const files = runOut('git', ['diff', '--name-only', 'HEAD']);

const prompt = `You are a senior architect re-checking a fix. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Plan:
${plan}

Changed files:
${files}

Working directory: ${process.cwd()}

Review the current state for architectural concerns: layer violations, wrong abstractions,
missing contracts, coupling issues, API design problems.
Focus on whether previously reported blockers have been resolved.

Be concise. End with exactly:
::kb-output::{"verdict":"APPROVED"|"NEEDS_FIXES","blockers_count":N,"summary":"<2-3 sentence summary>"}`;

const res = callClaude({ prompt, outputFormat: 'text', noSessionPersistence: true });
const reviewText = res.stdout;

// Anchor to the final `::kb-output::` line rather than scanning the whole free-text
// review, which may contain matching-looking substrings earlier in the model's prose.
const parsed = parseKbOutputLine(reviewText) || {};
const verdict = parsed.verdict === 'APPROVED' ? 'APPROVED' : 'NEEDS_FIXES';
const blockersCount = Number(parsed.blockers_count) || 0;
let summary = parsed.summary || '';

const currCodeHash = createHash('sha256').update(runOut('git', ['diff', 'HEAD'])).digest('hex');
const currFindingsHash = createHash('sha256').update(`${blockersCount}:${verdict}`).digest('hex');

let decision = 'still_issues';
if (verdict === 'APPROVED' || blockersCount === 0) {
  decision = 'passed';
} else if (PREV_CODE_HASH && currCodeHash === PREV_CODE_HASH && PREV_FINDINGS_HASH && currFindingsHash === PREV_FINDINGS_HASH) {
  decision = 'deadlock';
  summary = 'DEADLOCK: agent produced identical code with identical architect findings. Human review required.';
}

writeFileSync(`${artifactsDir}/architect-rerun-${ISSUE_NUMBER}.md`, reviewText);

emitKbOutput({ decision, blockers_count: blockersCount, codeHash: currCodeHash, findingsHash: currFindingsHash, summary: summary.trim() });
