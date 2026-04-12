# Contributing

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Local development

```bash
pnpm install
pnpm dev
```

## Quality gates

Run before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Scope

- `apps/web`: corporate and marketing pages
- `apps/docs`: public documentation
- `apps/app`: SaaS shell

## Localization

- EN is default route.
- RU is mirrored under `/ru`.
