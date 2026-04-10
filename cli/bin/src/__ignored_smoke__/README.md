# Ignored Smoke Tests (src)

**Status**: Disabled (2025-12-17)

## Why Disabled

These smoke tests are currently disabled due to timeouts and complex mocks.

See **[docs/tasks/cli-smoke-tests-fix.md](../../../../../docs/tasks/cli-smoke-tests-fix.md)** for full details.

## Files Here

- `exit-codes.smoke.spec.ts.skip` - 3 tests for exit codes
- `json-purity.smoke.spec.ts.skip` - 3 tests for JSON output purity
- `json-output.smoke.spec.ts.skip` - 2 tests for JSON metadata
- `devlink.exit-codes.smoke.spec.ts.skip` - 1 test for legacy devlink (can be deleted)

## Next Steps

Replace with E2E tests using real CLI binary execution.
