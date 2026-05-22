# syntax=docker/dockerfile:1
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/marketplace-registry-app --prod .kb/deploy/marketplace-registry-app
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/dist ./dist
# Prod config: adapters
COPY --chown=kb:nodejs plugins/marketplace-registry/app/.kb/kb.config.prod.json .kb/kb.config.json

# Marketplace lock with node_modules-relative adapter paths
COPY --chown=kb:nodejs plugins/marketplace-registry/app/.kb/marketplace.prod.lock .kb/marketplace.lock

RUN mkdir -p .kb/storage && chown -R kb:nodejs .kb

USER kb

EXPOSE 5071

CMD ["node", "dist/bootstrap.js"]
