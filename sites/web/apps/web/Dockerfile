FROM node:20-alpine AS base

# ── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# sites/web packages
COPY sites/web/package.json                          ./sites/web/
COPY sites/web/apps/web/package.json                 ./sites/web/apps/web/
COPY sites/web/apps/docs/package.json                ./sites/web/apps/docs/
COPY sites/web/packages/config/package.json          ./sites/web/packages/config/
COPY sites/web/packages/i18n/package.json            ./sites/web/packages/i18n/
COPY sites/web/packages/og/package.json              ./sites/web/packages/og/
COPY sites/web/packages/web-data-source/package.json ./sites/web/packages/web-data-source/

RUN corepack enable pnpm && pnpm install --frozen-lockfile --filter @kb-labs/web-site...

# ── builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules                             ./node_modules
COPY --from=deps /app/sites/web/node_modules                   ./sites/web/node_modules
COPY --from=deps /app/sites/web/apps/web/node_modules          ./sites/web/apps/web/node_modules
COPY --from=deps /app/sites/web/packages/og/node_modules       ./sites/web/packages/og/node_modules

COPY sites/web ./sites/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && pnpm --filter @kb-labs/web-site run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/sites/web/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/sites/web/apps/web/.next/static ./sites/web/apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "sites/web/apps/web/server.js"]
