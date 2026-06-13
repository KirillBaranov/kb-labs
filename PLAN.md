Now I have a precise understanding of the bug. Here is the plan:

---

## Summary

`buildShellSafeCommand` replaces `${{ inputs.foo }}` with `${_WF_foo}` in the shell command, but when the expression is wrapped in single quotes — the natural pattern for `jq --argjson x '${{ inputs.payload }}'` — bash single-quote semantics prevent `${_WF_foo}` from being expanded, so `jq` receives the literal string `${_WF_foo}` instead of JSON. Fix the quoting logic in `buildShellSafeCommand` and create the missing `04-invoice-approval.yml` demo.

---

## Root cause / context

`buildShellSafeCommand` (`plugins/workflow/contracts/src/expressions.ts:271–293`) is the only code path for `run:` blocks. It replaces every `${{ expr }}` with `${_WF_safeName}` and injects the resolved value as a shell env var. This is correct for double-quoted or unquoted contexts. The problem is the single-quote case:

```
# YAML:
run: jq --argjson payload '${{ inputs.invoice_payload }}' '{"x":1}'

# After buildShellSafeCommand:
run: jq --argjson payload '${_WF_inputs_invoice_payload}' '{"x":1}'
```

Bash single-quotes treat everything literally — `${_WF_...}` is never expanded. `jq --argjson` receives the literal text `${_WF_inputs_invoice_payload}`, which is not valid JSON, producing `jq: invalid JSON text passed to --argjson`.

The existing test `interpolateString: object input serializes to JSON` (line 416–419, `expressions.test.ts`) tests `interpolateString` — a different code path that does raw substitution. It gives false confidence: `run:` blocks go through `buildShellSafeCommand`, not `interpolateString`. The demo YAML `04-invoice-approval.yaml` is not present in the repo (referenced in the issue but never checked in), so the failure was only caught manually.

---

## Implementation steps

### 1. Fix `buildShellSafeCommand` to handle single-quote context

**File**: `plugins/workflow/contracts/src/expressions.ts`

Inside the `for (const expr of expressions)` loop (lines 279–291), before the general-pattern replacement, add a pre-pass that detects `'${{ expr }}'` occurrences and replaces the **entire single-quoted token** (including the quotes) with a double-quoted `"${_WF_var}"` reference. Then the existing general replacement handles any remaining unquoted occurrences.

```ts
// Replace '${{ expr }}' (single-quote wrapped) → "${_WF_var}"
// Single quotes in bash prevent ${...} expansion; switch to double quotes.
const sqPattern = new RegExp(
  `'\\$\\{\\{\\s*${escapeRegex(expr)}\\s*\\}\\}'`,
  'g',
)
command = command.replace(sqPattern, `"\${${safeName}}"`)

// Replace remaining unquoted/double-quoted occurrences → ${_WF_var}
const pattern = new RegExp(`\\$\\{\\{\\s*${escapeRegex(expr)}\\s*\\}\\}`, 'g')
command = command.replace(pattern, `\${${safeName}}`)
```

Update the JSDoc example to show the `jq --argjson` case:
```
Input:  `jq --argjson payload '${{ inputs.invoice_payload }}' '{"x":1}'`
Output: command = `jq --argjson payload "${_WF_inputs_invoice_payload}" '{"x":1}'`
        shellEnvVars = { _WF_inputs_invoice_payload: '{"vendor":"Acme","total":250}' }
```

### 2. Add regression tests for `buildShellSafeCommand` with JSON inputs

**File**: `plugins/workflow/contracts/src/__tests__/expressions.test.ts`

Add to the `describe('buildShellSafeCommand', ...)` block (after line 630). The `ctx` there doesn't have object inputs; add a separate describe block:

```ts
describe('buildShellSafeCommand — JSON object inputs (BUG-001)', () => {
  const ctx: ExpressionContext = {
    env: {},
    trigger: { type: 'manual' },
    steps: {},
    inputs: {
      invoice_payload: { vendor: 'ACME Corp', amount: 15000, currency: 'USD' },
    },
  }

  it('single-quoted ${{ expr }} becomes double-quoted "${_WF_var}" — shell expansion works', () => {
    const raw = `jq --argjson payload '${{ inputs.invoice_payload }}' '{"x":1}'`
    const { command } = buildShellSafeCommand(raw, ctx)
    // Single-quote wrapper must be replaced with double-quote so ${} expands in bash
    expect(command).toBe(`jq --argjson payload "\${_WF_inputs_invoice_payload}" '{"x":1}'`)
    expect(command).not.toContain(`'\${_WF_`) // no single-quote-wrapped ${} references
  })

  it('shellEnvVar for object input contains valid JSON string', () => {
    const raw = `jq --argjson payload '${{ inputs.invoice_payload }}' -n '$payload'`
    const { shellEnvVars } = buildShellSafeCommand(raw, ctx)
    const value = shellEnvVars['_WF_inputs_invoice_payload']
    expect(() => JSON.parse(value!)).not.toThrow()
    expect(JSON.parse(value!)).toEqual({ vendor: 'ACME Corp', amount: 15000, currency: 'USD' })
  })

  it('double-quoted ${{ expr }} remains double-quoted — unaffected', () => {
    const raw = `jq --argjson payload "${{ inputs.invoice_payload }}" -n '$payload'`
    const { command } = buildShellSafeCommand(raw, ctx)
    expect(command).toBe(`jq --argjson payload "\${_WF_inputs_invoice_payload}" -n '$payload'`)
  })
})
```

Also add a note next to the existing `interpolateString` test at line 416 to clarify it tests the non-`run:` code path:
```ts
// NOTE: interpolateString is used for with: fields, NOT for run: blocks.
// run: blocks go through buildShellSafeCommand — see 'buildShellSafeCommand — JSON object inputs' suite.
```

### 3. Create the missing `04-invoice-approval.yml` demo

**File**: `plugins/workflow/contracts/examples/04-invoice-approval.yml`

Implement a minimal but complete example using the now-correct single-quote pattern, plus the env-var alternative in a comment so users understand both:

```yaml
name: 04 — Invoice Approval
description: >
  Demonstrates passing a JSON object input to a shell step via --argjson.
  Uses the standard '${{ inputs.X }}' pattern, which the engine rewrites
  to a double-quoted "${_WF_...}" env var reference so jq receives valid JSON.

inputs:
  invoice_payload:
    type: object
    description: Invoice data (vendor, amount, currency)
    default:
      vendor: Acme Corp
      amount: 1500
      currency: USD

jobs:
  process:
    steps:
      - name: Parse invoice
        run: |
          total=$(jq --argjson payload '${{ inputs.invoice_payload }}' -n '$payload.amount')
          vendor=$(jq --argjson payload '${{ inputs.invoice_payload }}' -n '-r $payload.vendor')
          echo "Approving ${total} for ${vendor}"
          PAYLOAD=$(jq -cn --argjson p '${{ inputs.invoice_payload }}' '{approved: true, vendor: $p.vendor, amount: $p.amount}' | base64)
          echo "::kb-output:base64::${PAYLOAD}"
```

### 4. Verify the `worker.ts` env forwarding is correct (no changes needed, just confirm)

**File**: `plugins/workflow/daemon/src/worker.ts` lines 375–403

The worker passes `shellEnvVars` into `with.env` (line 386) and `spec.env` is separately coerced via `coerceToString` (line 401). Both paths are correct once the command string itself no longer wraps the env var reference in single quotes. No changes required here, but confirm via test.

---

## Tests / verification

**Unit tests** (run without daemon):
```bash
pnpm --filter @kb-labs/workflow-contracts run test
```
All three new `buildShellSafeCommand — JSON object inputs` cases should pass; the existing suite must be green.

**Manual verification** (with daemon running):
```bash
kb-dev start
pnpm kb workflow run 04-invoice-approval --input '{"invoice_payload":{"vendor":"Test Co","amount":999,"currency":"EUR"}}'
```
Expected: step emits `::kb-output:base64::...` with `{"approved":true,"vendor":"Test Co","amount":999}` decoded; `stderr` has no `jq: invalid JSON text passed to --argjson`.

**Regression check**: run the full workflow handler test suite to confirm no existing shell-safety tests regress:
```bash
pnpm --filter @kb-labs/workflow-entry run test:cli
```
