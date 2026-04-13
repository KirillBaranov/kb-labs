FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Install prod dependencies only
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY plugins/gateway/app/package.json plugins/gateway/app/package.json
RUN corepack enable pnpm && pnpm install --prod --frozen-lockfile --filter @kb-labs/gateway-app

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 kb

COPY --from=deps --chown=kb:nodejs /app/node_modules ./node_modules

# dist/ built on CI by kb-devkit before docker build
COPY --chown=kb:nodejs plugins/gateway/app/dist ./dist

# Prod config: adapters + gateway upstreams
COPY --chown=kb:nodejs plugins/gateway/app/.kb/kb.config.prod.json .kb/kb.config.json

# Marketplace lock with node_modules-relative adapter paths
COPY --chown=kb:nodejs plugins/gateway/app/.kb/marketplace.prod.lock .kb/marketplace.lock

RUN mkdir -p .kb/database .kb/storage && chown -R kb:nodejs .kb

USER kb

EXPOSE 4000

CMD ["node", "dist/index.js"]

