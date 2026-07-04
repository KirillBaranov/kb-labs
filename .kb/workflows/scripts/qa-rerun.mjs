#!/usr/bin/env node
// Step: Adversarial QA Re-run — re-attack after agent fix, detect deadlock
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workspaceRoot, runOut, callClaude, parseKbOutputLine, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE, PREV_CODE_HASH, PREV_FINDINGS_HASH } = process.env;
const artifactsDir = '.kb/run-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const files = runOut('git', ['diff', '--name-only', 'HEAD']);
const cwd = process.cwd();

const prompt = `You are an adversarial QA engineer re-testing a bug fix. Write in English.

IMPORTANT SECURITY RULE: Never quote or include the literal value of any secret, token, or credential in your output.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Changed files:
${files}

Working directory: ${cwd}

The agent has attempted to fix previously reported bugs. Re-run your attacks.
Start relevant services if needed: /Users/kirillbaranov/Desktop/kb-labs-workspace/tools/kb-dev/kb-dev start --config .kb/devservices.dev.yaml 2>/dev/null

Focus on:
1. Were the specific bugs from the previous report actually fixed?
2. Did the fix introduce any new bugs?
3. Any remaining attack vectors?

Be concise. End with exactly:
::kb-output::{"verdict":"PASSED"|"BUGS_FOUND","bugs_count":N,"summary":"<2-3 sentence summary>"}`;

const res = callClaude({ prompt, outputFormat: 'text', noSessionPersistence: true });
const qaText = res.stdout;

// Anchor to the final `::kb-output::` line rather than scanning the whole free-text
// report, which may contain matching-looking substrings earlier in the model's prose.
const parsed = parseKbOutputLine(qaText) || {};
const verdict = parsed.verdict === 'PASSED' ? 'PASSED' : 'BUGS_FOUND';
const bugsCount = Number(parsed.bugs_count) || 0;
let summary = parsed.summary || '';

const currCodeHash = createHash('sha256').update(runOut('git', ['diff', 'HEAD'])).digest('hex');
const currFindingsHash = createHash('sha256').update(`${bugsCount}:${verdict}`).digest('hex');

let decision = 'still_issues';
if (verdict === 'PASSED' || bugsCount === 0) {
  decision = 'passed';
} else if (PREV_CODE_HASH && currCodeHash === PREV_CODE_HASH && PREV_FINDINGS_HASH && currFindingsHash === PREV_FINDINGS_HASH) {
  decision = 'deadlock';
  summary = 'DEADLOCK: agent produced identical code with identical QA findings. Human review required.';
}

writeFileSync(`${artifactsDir}/qa-rerun-${ISSUE_NUMBER}.md`, qaText);

emitKbOutput({ decision, bugs_count: bugsCount, codeHash: currCodeHash, findingsHash: currFindingsHash, summary: summary.trim() });
