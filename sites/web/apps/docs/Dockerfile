FROM node:20-alpine AS base

# ── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# sites/web packages
COPY sites/web/package.json                          ./sites/web/
COPY sites/web/apps/docs/package.json                ./sites/web/apps/docs/
COPY sites/web/packages/og/package.json              ./sites/web/packages/og/

RUN corepack enable pnpm && pnpm install --frozen-lockfile --filter @kb-labs/docs-site...

# ── builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules                              ./node_modules
COPY --from=deps /app/sites/web/node_modules                    ./sites/web/node_modules
COPY --from=deps /app/sites/web/apps/docs/node_modules          ./sites/web/apps/docs/node_modules
COPY --from=deps /app/sites/web/packages/og/node_modules        ./sites/web/packages/og/node_modules

COPY sites/web ./sites/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && pnpm --filter @kb-labs/docs-site run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/sites/web/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/sites/web/apps/docs/.next/static ./sites/web/apps/docs/.next/static

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "sites/web/apps/docs/server.js"]
