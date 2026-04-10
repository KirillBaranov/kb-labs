FROM node:20-alpine AS base

# ── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# sites/kb-labs-web packages
COPY sites/kb-labs-web/package.json                          ./sites/kb-labs-web/
COPY sites/kb-labs-web/apps/web/package.json                 ./sites/kb-labs-web/apps/web/
COPY sites/kb-labs-web/apps/docs/package.json                ./sites/kb-labs-web/apps/docs/
COPY sites/kb-labs-web/packages/config/package.json          ./sites/kb-labs-web/packages/config/
COPY sites/kb-labs-web/packages/i18n/package.json            ./sites/kb-labs-web/packages/i18n/
COPY sites/kb-labs-web/packages/og/package.json              ./sites/kb-labs-web/packages/og/
COPY sites/kb-labs-web/packages/web-data-source/package.json ./sites/kb-labs-web/packages/web-data-source/

RUN corepack enable pnpm && pnpm install --frozen-lockfile --filter @kb-labs/web-site...

# ── builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules                                    ./node_modules
COPY --from=deps /app/sites/kb-labs-web/node_modules                 ./sites/kb-labs-web/node_modules
COPY --from=deps /app/sites/kb-labs-web/apps/web/node_modules        ./sites/kb-labs-web/apps/web/node_modules
COPY --from=deps /app/sites/kb-labs-web/packages/og/node_modules     ./sites/kb-labs-web/packages/og/node_modules

COPY sites/kb-labs-web ./sites/kb-labs-web

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && pnpm --filter @kb-labs/web-site run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/sites/kb-labs-web/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/sites/kb-labs-web/apps/web/.next/static ./sites/kb-labs-web/apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "sites/kb-labs-web/apps/web/server.js"]
