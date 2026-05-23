# KB Labs E2E Checklist

> Auto-generated — do not edit manually.

```
Last run: 2026-05-23T10:00:36.175Z
Passed: 6  Failed: 0  Planned: 0
```

## ..

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| WWT-01 | shell step CWD is worktree, not the platform root | `../workflows/specs/worktree.spec.ts` | ✅ covered |
| WWT-02 | KB_PLATFORM_ROOT is set and does not contain .worktrees | `../workflows/specs/worktree.spec.ts` | ✅ covered |
| WWT-03 | KB_WORKSPACE_ROOT is set and points inside .worktrees | `../workflows/specs/worktree.spec.ts` | ✅ covered |
| WWT-04 | cli/bin/dist symlink target resolves into the platform, not the worktree | `../workflows/specs/worktree.spec.ts` | ✅ covered |
| WWT-05 | pnpm kb --version succeeds in the worktree | `../workflows/specs/worktree.spec.ts` | ✅ covered |
| WWT-06 | files written to worktree dist/ do not appear in the platform | `../workflows/specs/worktree.spec.ts` | ✅ covered |
