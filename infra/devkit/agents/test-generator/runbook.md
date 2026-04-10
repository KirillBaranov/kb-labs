# Runbook — Test Generator

## Steps
1. Identify functions/methods with low/no coverage.
2. For each function:
   - Test main path, edge cases, and error handling.
   - Avoid snapshots unless structure is stable and justified.
3. Create tests in `__tests__/name.spec.ts` near the source file.
4. Run tests and check coverage locally.

## Commands
- `pnpm -r run test`
- `pnpm -r run test:coverage`
- `pnpm --filter <pkg> run test`

## Tips
- Import from package public exports when possible to mirror user usage.
- If a package has no tests, add a `smoke.spec.ts`.
