# syntax=docker/dockerfile:1
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/marketplace-registry-app --prod .kb/deploy/marketplace-registry-app
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/marketplace-registry-app/dist ./dist

# Composition is deliberately absent from the release image. kb-create writes
# the user's explicit config and lock into their derived image; the entrypoint
# refuses to boot without both files.
COPY --chown=kb:nodejs plugins/marketplace-registry/app/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN mkdir -p .kb/storage && chown -R kb:nodejs .kb && \
    chmod +x /app/docker-entrypoint.sh

USER kb

EXPOSE 5071

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/bootstrap.js"]
