# Ignored Smoke Tests

**Status**: Disabled (2025-12-17)

## Why Disabled

These smoke tests are currently disabled due to:

1. **Timeouts** - All tests timeout at 5000ms
2. **Complex mocks** - Using `vi.hoisted()` and mocking entire `@kb-labs/cli-commands`
3. **Async deadlocks** - Mocks don't sync with real async code flow
4. **Violates philosophy** - "No mocks, real tests" ✅

## What to Do

See **[docs/tasks/cli-smoke-tests-fix.md](../../../../docs/tasks/cli-smoke-tests-fix.md)** for:
- Detailed problem analysis
- E2E test replacement strategy
- Implementation steps
- Code examples

## Files Here

- `smoke.spec.ts.skip` - 18 tests for global flags, builtin commands, JSON purity

## Next Steps

Replace with **E2E tests** using `child_process.spawn()`:
- Run real CLI binary instead of mocking internals
- Test actual user-facing behavior
- No more timeouts or async issues

**Estimated effort**: 2-3 hours
