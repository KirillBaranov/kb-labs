#!/usr/bin/env node
// Step: Agent Implements
// Env: ISSUE_NUMBER, ISSUE_TITLE, IMPL_FEEDBACK, PLAN_SESSION_ID
import { workspaceRoot, callClaude, parseClaudeJson, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { IMPL_FEEDBACK, PLAN_SESSION_ID } = process.env;

const selfVerifyInstructions = `
Self-verification (do this before finishing):
1. Run: kb-devkit run build --affected
   If build fails, fix all errors before proceeding.
2. Run tests for affected packages: pnpm --filter <affected-package> run test:cli 2>/dev/null
   If tests fail, fix them — do not skip or delete tests to make them pass.
3. Do a quick smoke check: try the feature manually if a service is running.
Only finish when you are personally confident the implementation is correct.`;

let res;
if (IMPL_FEEDBACK) {
  const prompt = `The user reviewed the implementation and requested corrections. Write in English.

${IMPL_FEEDBACK}

Working directory: ${process.cwd()}

Look at git diff HEAD~1 to understand what was previously implemented.
Make the requested changes.
${selfVerifyInstructions}
Do NOT commit — just make the changes.
End with a short summary of what you changed and how you verified it.`;

  res = callClaude({ prompt, outputFormat: 'json', mergeStderr: true });
} else {
  const prompt = `The plan you created has been approved. Now implement it exactly as planned. Write summaries in English.

Working directory: ${process.cwd()}

Instructions:
1. Follow your plan step by step — do not deviate.
2. Make all necessary code changes.
3. Write or update tests that cover the new behaviour.
${selfVerifyInstructions}
4. Do NOT commit — just make the changes.
End with a short summary of what you changed and how you verified it.`;

  res = callClaude({ prompt, resume: PLAN_SESSION_ID || undefined, outputFormat: 'json', mergeStderr: true });
}

const { result: summary, sessionId } = parseClaudeJson(res.stdout);

// Output sessionId and summary
emitKbOutput({ sessionId });
emitKbOutput({ summary: summary.slice(-2000) });
