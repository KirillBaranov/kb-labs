# kb-labs-web

Monorepo for KB Labs web surfaces:

- `apps/web` -> `kblabs.dev`
- `apps/docs` -> `docs.kblabs.dev`
- `apps/app` -> `app.kblabs.dev`

## Stack

- Next.js (App Router)
- MDX content (web/docs/blog)
- pnpm workspaces + Turbo
- EN default + RU mirror under `/ru`
- UI dependencies linked from `kb-labs-studio`

## Getting started

```bash
pnpm install
pnpm dev
```

## Common commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm check
```

## UI dependencies

This repo consumes UI packages via local links:

- `@kb-labs/studio-ui-core`
- `@kb-labs/studio-ui-kit`

They are linked from `../kb-labs-studio/packages/*`.
