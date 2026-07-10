No fix commit exists. Confirmed as unimplemented.

PIPELINE_STATUS: NEEDS_IMPLEMENTATION

## Summary
Fix the `--json` formatter in `task-comment-add.ts` to not blindly access `comment.user.username`, since ClickUp's actual `POST /task/{id}/comment` response doesn't reliably include a populated `user`/`comment_text` shape the way the list-comments endpoint does.

## Root cause / context
- `plugins/clickup/entry/src/commands/task-comment-add.ts:45` does `comment.user.username` unguarded.
- `addTaskComment` (`plugins/clickup/core/src/api.ts:189-203`) types the response as `ClickUpComment` (`plugins/clickup/contracts/src/types.ts:65`), which requires `user: ClickUpMember`, `comment_text`, `comment`, `resolved`. That shape matches the **list comments** GET response, not ClickUp's real create-comment POST response (which typically only returns `{ id, hist_id, date }`).
- The existing unit test (`task-comment-add.cli.test.ts`) mocks `addTaskComment` to resolve the full `mockComment` fixture, masking the mismatch — it never exercises the real API response shape, so the bug wasn't caught.
- No commit touches this file since the plugin was created (`21f9f3aa`) and refactored (`6572198e`, `8b4a16b9`) — the bug is unaddressed.

## Implementation steps
1. `plugins/clickup/core/src/api.ts` — introduce a distinct return type for `addTaskComment`, e.g. `ClickUpCommentCreateResult` (`{ id: string; hist_id?: string; date: string }`), reflecting what ClickUp's create-comment endpoint actually returns, instead of reusing `ClickUpComment`.
2. `plugins/clickup/contracts/src/types.ts` — add that new interface near `ClickUpComment`.
3. `plugins/clickup/entry/src/commands/task-comment-add.ts:44-48` — update the `--json` branch to build the slim object defensively from the actual fields available, e.g.:
   ```ts
   ctx.ui?.json?.(input.flags.full
     ? comment
     : { id: comment.id, date: comment.date, ...(comment as any).user ? { user: comment.user.username } : {} });
   ```
   or, better, since `comment_text` is already known locally (`input.flags.text`), don't rely on the API echoing it back — build the slim object from local input + whatever the API actually returned (`id`, `date`), and only include `user`/`comment_text` if present via optional chaining (`comment.user?.username`).
4. Update `plugins/clickup/entry/src/rest/handlers/task-comment-add-handler.ts` if it has the same assumption (check for similar `.user.username` access) and fix it there too.

## Tests / verification
1. Update `plugins/clickup/entry/src/__tests__/cli/task-comment-add.cli.test.ts`'s mock for `addTaskComment` in TCA-02 to resolve the real, sparse create-comment shape (e.g. `{ id: 'comment-1', date: '123' }`, no `user`) — this test should fail before the fix (throwing `Cannot read properties of undefined`) and pass after.
2. Keep TCA-02b (`--full`) working by mocking a call returning the sparse shape as well, and asserting the raw object is passed through unmodified.
3. Manually run `pnpm kb clickup task comments add <taskId> --text "test" --json` against a real/sandboxed ClickUp workspace to confirm no `INTERNAL_ERROR`.