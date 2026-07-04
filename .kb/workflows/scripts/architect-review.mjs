#!/usr/bin/env node
// Step: Architect Review
// Env: ISSUE_NUMBER, ISSUE_TITLE
import { writeFileSync, mkdirSync } from 'node:fs';
import { workspaceRoot, runOut, readFileOrEmpty, callClaude } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, ISSUE_TITLE } = process.env;
const artifactsDir = '.kb/run-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const diff = runOut('git', ['diff', 'HEAD']).split('\n').slice(0, 500).join('\n');
const files = runOut('git', ['diff', '--name-only', 'HEAD']);
const plan = readFileOrEmpty('PLAN.md');

const prompt = `You are a senior software architect reviewing an implementation. Write in English.

IMPORTANT SECURITY RULE: Never quote, print, or include the literal value of any secret, token, password, or credential in your output — even if you find one in a file. Describe the problem (e.g. 'a live token is hardcoded') without revealing the value itself.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Implementation plan:
${plan}

Changed files:
${files}

Diff (first 500 lines):
${diff}

Review the implementation for:
1. Architecture correctness — does it fit the existing patterns?
2. Abstractions — are new abstractions justified or over-engineered?
3. Coupling — does it introduce tight coupling or circular deps?
4. Naming — are names clear and consistent with codebase conventions?
5. Test coverage — are critical paths tested?
6. Edge cases — are obvious failure modes handled?

Output a structured Markdown review:

## Verdict
APPROVED | NEEDS_FIXES

## Summary
(2-3 sentences overall assessment)

## Findings
(list findings with severity: blocker / warning / suggestion)
Each finding: - [SEVERITY] description

## Conclusion
(what must be fixed before merge, if anything)

At the very end output exactly:
::kb-output::{"verdict":"APPROVED"|"NEEDS_FIXES","blockers_count":N,"review":"<first 300 chars of summary>"}`;

const res = callClaude({ prompt, outputFormat: 'text', noSessionPersistence: true });
const reviewText = res.stdout;

// Save to artifacts dir (reliable) and /tmp (legacy compat)
writeFileSync(`${artifactsDir}/architect-review-${ISSUE_NUMBER}.md`, reviewText);
writeFileSync(`/tmp/kb-architect-review-${ISSUE_NUMBER}.md`, reviewText);

console.log(reviewText);
