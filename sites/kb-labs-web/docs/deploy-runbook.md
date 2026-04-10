# Deploy Runbook

## Domain mapping

- `kblabs.dev` -> `apps/web`
- `docs.kblabs.dev` -> `apps/docs`
- `app.kblabs.dev` -> `apps/app`

## Redirects

- `www.kblabs.dev/*` -> `https://kblabs.dev/$1` (301)
- `kblabs.dev/docs` -> `https://docs.kblabs.dev/` (301)
- `kblabs.dev/app` -> `https://app.kblabs.dev/` (302, then 301)
- `kblabs.dev/status` -> `https://status.kblabs.dev/` (301)

## CI checks

PRs must pass:

- lint
- typecheck
- build

## Environment variables

Define per app as needed:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_DOCS_URL`
- `NEXT_PUBLIC_STATUS_URL`
