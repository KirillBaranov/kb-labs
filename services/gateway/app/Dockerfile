FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/gateway-app --prod .kb/deploy/gateway-app
COPY --chown=kb:nodejs .kb/deploy/gateway-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/gateway-app/dist ./dist

# Default composition, applied by docker-entrypoint.sh only when nothing is
# mounted over .kb/kb.config.json / .kb/marketplace.lock. These are NOT the
# live config path — do not read them directly; see docs/adr/0037.
COPY --chown=kb:nodejs services/gateway/app/.kb/kb.config.prod.json .kb/kb.config.default.json
COPY --chown=kb:nodejs services/gateway/app/.kb/marketplace.prod.lock .kb/marketplace.default.lock
COPY --chown=kb:nodejs services/gateway/app/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN mkdir -p .kb/database .kb/storage .kb/analytics && chown -R kb:nodejs .kb && \
    chmod +x /app/docker-entrypoint.sh

USER kb

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]


