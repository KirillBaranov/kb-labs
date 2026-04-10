FROM node:20-alpine AS base

# ── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace manifests so pnpm can install correctly
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/
COPY packages/config/package.json ./packages/config/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/og/package.json ./packages/og/

RUN corepack enable pnpm && pnpm install --frozen-lockfile --filter @kb-labs/web-site...

# ── builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/og/node_modules ./packages/og/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm && pnpm --filter @kb-labs/web-site run build

# ── runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
