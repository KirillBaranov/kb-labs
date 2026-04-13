FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy workspace manifests for pnpm deploy
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages needed by gateway-app
COPY core/                              ./core/
COPY sdk/                               ./sdk/
COPY cli/                               ./cli/
COPY shared/                            ./shared/
COPY adapters/openai/                   ./adapters/openai/
COPY adapters/redis/                    ./adapters/redis/
COPY adapters/sqlite/                   ./adapters/sqlite/
COPY adapters/pino/                     ./adapters/pino/
COPY adapters/log-sqlite/               ./adapters/log-sqlite/
COPY adapters/log-ringbuffer/           ./adapters/log-ringbuffer/
COPY adapters/eventbus-cache/           ./adapters/eventbus-cache/
COPY adapters/fs/                       ./adapters/fs/
COPY plugins/gateway/                   ./plugins/gateway/
COPY infra/devkit/                      ./infra/devkit/

RUN corepack enable pnpm && \
    pnpm deploy --filter @kb-labs/gateway-app --prod /prod/gateway

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 kb

COPY --from=deps --chown=kb:nodejs /prod/gateway ./

# Prod config: adapters + gateway upstreams (injected at build or via volume)
COPY plugins/gateway/app/.kb/kb.config.prod.json .kb/kb.config.json

# Marketplace lock with npm-resolved adapter paths
COPY plugins/gateway/app/.kb/marketplace.prod.lock .kb/marketplace.lock

RUN mkdir -p .kb/database .kb/storage && chown -R kb:nodejs .kb

USER kb

EXPOSE 4000

CMD ["node", "dist/index.js"]
