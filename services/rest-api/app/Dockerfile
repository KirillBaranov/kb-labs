# syntax=docker/dockerfile:1
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/rest-api-app --prod .kb/deploy/rest-api-app
COPY --chown=kb:nodejs .kb/deploy/rest-api-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/rest-api-app/dist ./dist

# Default composition, applied by docker-entrypoint.sh only when nothing is
# mounted over .kb/kb.config.json / .kb/marketplace.lock (see docs/adr/0037).
# The default lock is DELIBERATELY EMPTY — it was not produced by a real
# `pnpm kb marketplace install` run, unlike gateway's baked lock. Entity
# registry boots cleanly with zero plugins reported; supply a real
# marketplace.lock via mount for anything beyond an empty REST API shell.
COPY --chown=kb:nodejs services/rest-api/app/.kb/kb.config.prod.json .kb/kb.config.default.json
COPY --chown=kb:nodejs services/rest-api/app/.kb/marketplace.prod.lock .kb/marketplace.default.lock
COPY --chown=kb:nodejs services/rest-api/app/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chown -R kb:nodejs .kb && chmod +x /app/docker-entrypoint.sh

USER kb

EXPOSE 5050

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
