# Skill: config-mode

Switch the runtime used by the `kb-labs-workspace` development checkout.

## When to use

- User says "переключи в дев режим", "switch to dev", "use dev config"
- User says "переключи в прод режим", "switch to prod", "use prod config"
- User wants to restart services in a specific mode

## What the modes mean

`kb-labs-workspace` remains the source checkout in both modes. Production is
the separate installation at `/Users/kirillbaranov/Desktop/work/kb-labs-infra/platform`.

**Dev** (`pnpm config:dev`) — removes `platform.dir` from `.kb/kb.config.json`.
Bootstrap finds `node_modules` in this workspace → workspace packages + full adapters active.
`.kb/kb.config.json` is the single source of truth (openai, redis, mongodb, qdrant, etc.).

**Prod runtime** (`pnpm config:prod`) — adds
`platform.dir: "/Users/kirillbaranov/Desktop/work/kb-labs-infra/platform"`.
Config base is read from that production platform's `.kb/kb.config.jsonc`.
Platform-owned fields (`adapters`, `adapterOptions`, `execution`) override the local dev config.

Do not treat prod runtime mode as a checkout switch. Release preparation and
workspace code changes must run from green `main` in `kb-labs-workspace` with
the workflow daemon rooted in that workspace. Return to dev mode before
`release-prepare`.

## Commands

```bash
pnpm config:dev    # switch to dev mode
pnpm config:prod   # switch to prod mode
```

Underlying script: `scripts/config-mode.sh <dev|prod>`

## Typical flows

### Switch to dev and restart
```bash
pnpm config:dev
pnpm dev:restart
```

### Switch to prod and restart
```bash
pnpm config:prod
pnpm dev:restart
```

### Check current mode
```bash
node -e "const c=require('./.kb/kb.config.json'); console.log(c.platform.dir ? 'prod: '+c.platform.dir : 'dev')"
```

## Notes

- Never edit `.kb/kb.config.json` ports or adapter lists without explicit user permission.
- `scripts/config-mode.sh` preserves the full config structure — only `platform.dir` is added/removed.
- After switching mode, always restart services with `pnpm dev:restart` for changes to take effect.
