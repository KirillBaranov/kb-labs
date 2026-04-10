# Runbook — Release Manager

## Preflight
- `pnpm install`
- `pnpm lint && pnpm type-check`
- `pnpm -r run test`
- `pnpm -r run build`

## Plan
- Determine semver bump.
- Summarize changes by category.
- Identify impacted packages (monorepo).

## Output
- GitHub Release draft (markdown).
- Optional: `pnpm -r publish` if configured (requires `NPM_TOKEN`).
- Do not push tags unless confirmed.
