FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/gateway-app --prod .kb/deploy/gateway-app
COPY --chown=kb:nodejs .kb/deploy/gateway-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/gateway-app/dist ./dist

# Prod config: adapters + gateway upstreams
COPY --chown=kb:nodejs plugins/gateway/app/.kb/kb.config.prod.json .kb/kb.config.json

# Marketplace lock with node_modules-relative adapter paths
COPY --chown=kb:nodejs plugins/gateway/app/.kb/marketplace.prod.lock .kb/marketplace.lock

RUN mkdir -p .kb/database .kb/storage && chown -R kb:nodejs .kb

USER kb

EXPOSE 4000

CMD ["node", "dist/index.js"]

