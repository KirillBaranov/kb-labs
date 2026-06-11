Now I have everything I need. Let me write the implementation plan.

---

## Summary

The `relativeTime()` helper in `plugins/workflow/entry/src/commands/runs-list.ts` computes `diffMs = Date.now() - timestamp` and formats it as "Xs ago", "Xm ago", etc. When the daemon returns a timestamp that is slightly in the future (clock skew, queued-but-not-started runs, or a `createdAt` set server-side before the client clock), `diffMs` is negative — causing output like `"-1s ago"` or `"-0m ago"` in the runs table.

## Root cause / context

`relativeTime` has no guard for the case where `diffMs < 0`. The original code flows directly into `Math.floor(diffMs / 1000)` and interpolates the result into the string, producing visually broken negative values. The fix is a single early-return guard: any non-positive diff should render as `"just now"`.

The issue surfaces most often with:
- Runs that are `queued` or just created — `createdAt` is set by the daemon at the moment of insertion, which may be marginally ahead of `Date.now()` on the client.
- `startedAt` being populated optimistically by the daemon before the run actually starts.

## Implementation steps

1. **`plugins/workflow/entry/src/commands/runs-list.ts` — add future-timestamp guard**

   In function `relativeTime` (line 23), replace:
   ```ts
   const diffMs = Date.now() - new Date(isoStr).getTime();
   if (diffMs < 1000) { return 'just now'; }
   ```
   with:
   ```ts
   const diffMs = Date.now() - new Date(isoStr).getTime();
   if (diffMs <= 0) { return 'just now'; }
   ```
   The boundary condition `diffMs === 0` (exact match) should also show `"just now"`, not `"0s ago"`.

2. **`plugins/workflow/entry/src/__tests__/cli/runs-list.cli.test.ts` — add regression test CL-09**

   Add a new test case after CL-08:
   ```ts
   it('CL-09: future startedAt renders as "just now" (not negative)', async () => {
     const futureDate = new Date(Date.now() + 60_000).toISOString();
     MockedClient.mockImplementation(() => makeClient({
       listRuns: async () => [
         { id: 'r-future', name: 'future-run', status: 'running', createdAt: futureDate, startedAt: futureDate },
       ],
     }));

     const { ui, captured } = createCapturedUI();
     const ctx = createMockContext({ ui });
     const result = await runsListCommand.execute(ctx, mockCLIInput({ flags: {} }));

     expect(result.exitCode).toBe(0);
     const row = captured.table[0]!.rows[0]!;
     const whenCell = row['When'] as string;
     expect(whenCell).toBe('just now');
     expect(whenCell).not.toMatch(/-\d/);  // no negative numbers
   });
   ```

   This test must **fail** on the unpatched code and **pass** after the fix.

## Tests / verification

```bash
# Run the handler tests for the workflow entry package (no daemon needed)
pnpm --filter @kb-labs/workflow-entry run test:cli
```

Expected: CL-09 passes; all existing CL-01…CL-08 tests continue to pass. No other packages are affected — the change is entirely local to `runs-list.ts`.
