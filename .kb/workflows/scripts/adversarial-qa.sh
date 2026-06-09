#!/usr/bin/env bash
# Step: Adversarial QA
# Env: ISSUE_NUMBER, ISSUE_TITLE
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

PLAN=$(cat PLAN.md 2>/dev/null || echo "")
DIFF=$(git diff HEAD --stat 2>/dev/null)
FILES=$(git diff --name-only HEAD 2>/dev/null)

PROMPT="You are an adversarial QA engineer. Write in English.

IMPORTANT SECURITY RULE: Never quote, print, or include the literal value of any secret, token, password, or credential in your output — even if you find one in a file. Describe the problem without revealing the value.
Your job is NOT to verify the happy path. Your job is to BREAK the implementation.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

What was implemented (plan):
$PLAN

Changed files:
$FILES

Diff stat:
$DIFF

Working directory: $(pwd)

You have full access to:
- CLI: pnpm kb <command>, curl, gh
- Running services (check with: pnpm kb status or curl http://localhost:4000/health)
- Git history: git log, git diff
- Source code: read any file

Your responsibilities:

PART 1 — Test coverage audit:
1. Read every new/changed test file
2. Check: do tests cover the happy path? edge cases? failure modes?
3. Run the tests: pnpm --filter <affected-package> run test:cli 2>/dev/null
4. Check if tests actually fail when you break the code (mutation check — comment out
   a key line and run tests, see if they catch it, then revert)
5. Flag: missing tests, tests that always pass regardless, tests that test nothing real

PART 2 — Adversarial attacks:
1. Read the changed files to understand exactly what was implemented
2. Start relevant services if not running (use /Users/kirillbaranov/kb-platform/bin/kb-dev start --config .kb/devservices.dev.yaml)
3. Try to break it — attack vectors:
   - Invalid / empty / null inputs
   - Boundary values (0, -1, max int, empty string, very long strings)
   - Missing required fields
   - Wrong types
   - Concurrent / rapid repeated calls
   - Calling things in wrong order
   - Triggering the feature from unexpected states
   - Partial failure scenarios
   - Uncaught exceptions or unhandled edge cases
4. For each attack: describe what you tried, what you expected, what actually happened
5. If you find a real bug: reproduce it reliably and document exact steps

Output a Markdown report:

## Verdict
PASSED | BUGS_FOUND

## Test Coverage Assessment
- Tests written: yes/no
- Coverage quality: strong / adequate / weak / none
- Tests actually catch failures: yes / no / partially
- Missing: (list what's not covered)

## Attack Summary
(what you tried overall)

## Findings
(for each issue found — both coverage gaps and runtime bugs)
### [BUG|WEAK_TEST|MISSING_TEST|WARNING] Title
- **Type**: runtime bug / coverage gap / false test
- **Attack / observation**: what you did or found
- **Expected**: what should happen
- **Actual**: what happened
- **Severity**: critical / major / minor
- **Reproduce**: exact command or steps

## Conclusion
(overall assessment — is this safe to ship?)

At the very end output exactly:
::kb-output::{\"verdict\":\"PASSED\"|\"BUGS_FOUND\",\"bugs_count\":N,\"report\":\"<2-3 sentence summary>\"}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

QA_TEXT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

# Save to artifacts dir (reliable) and /tmp (legacy compat)
printf '%s' "$QA_TEXT" > "${ARTIFACTS_DIR}/qa-report-${ISSUE_NUMBER}.md"
printf '%s' "$QA_TEXT" > "/tmp/kb-qa-report-${ISSUE_NUMBER}.md"

echo "$QA_TEXT"
