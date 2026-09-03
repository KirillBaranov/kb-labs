# syntax=docker/dockerfile:1
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/studio-app --prod .kb/deploy/studio-app
#
# NOT the gateway/rest-api pattern: entry is server.js (a plain node:http
# static file server + SPA-config injector — see server.js header), not
# dist/index.js. dist/ holds the rspack-built static bundle only.
COPY --chown=kb:nodejs .kb/deploy/studio-app/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/studio-app/dist ./dist
COPY --chown=kb:nodejs .kb/deploy/studio-app/server.js ./server.js

# No platform config: server.js reads its own env vars directly (KB_API_
# BASE_URL, KB_GATEWAY_TOKEN, KB_EVENTS_BASE_URL, PORT, HOST — see server.js).
# It is not part of the kb.config.json / marketplace.lock system.
#
# server.js's own header recommends nginx/ALB/Cloudflare in front in
# production; this image serves static files and proxies /api/* to
# KB_API_BASE_URL directly, which is sufficient for most deployments.

USER kb

EXPOSE 3000

CMD ["node", "server.js"]
