# syntax=docker/dockerfile:1
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/marketplace-registry-app --prod .kb/deploy/marketplace-registry-app
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/dist ./dist

# Default composition, applied by docker-entrypoint.sh only when nothing is
# mounted over .kb/kb.config.json / .kb/marketplace.lock. These are NOT the
# live config path — do not read them directly; see docs/adr/0037.
COPY --chown=kb:nodejs plugins/marketplace-registry/app/.kb/kb.config.prod.json .kb/kb.config.default.json
COPY --chown=kb:nodejs plugins/marketplace-registry/app/.kb/marketplace.prod.lock .kb/marketplace.default.lock
COPY --chown=kb:nodejs plugins/marketplace-registry/app/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN mkdir -p .kb/storage && chown -R kb:nodejs .kb && \
    chmod +x /app/docker-entrypoint.sh

USER kb

EXPOSE 5071

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/bootstrap.js"]
