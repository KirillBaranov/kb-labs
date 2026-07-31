# syntax=docker/dockerfile:1
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# bootstrap.ts resolves plugin/cron discovery from KB_PROJECT_ROOT (falling
# back to the resolved repo root) — pin it explicitly so discovery is
# deterministic under a container WORKDIR that has no .git to anchor on.
ENV KB_PROJECT_ROOT=/app

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/workflow-daemon --prod .kb/deploy/workflow-daemon
COPY --chown=kb:nodejs .kb/deploy/workflow-daemon/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/workflow-daemon/dist ./dist

# Default composition, applied by docker-entrypoint.sh only when nothing is
# mounted over .kb/kb.config.json / .kb/marketplace.lock (see docs/adr/0037).
# Deliberately omits `workspace`/`environment` adapters — bootstrap.ts logs a
# non-fatal warning and disables balanced/strict plugin isolation without
# them; relaxed isolation still works. The default lock is empty (no real
# `pnpm kb marketplace install` run baked in) — no cron/plugin workflows are
# registered until a real marketplace.lock is mounted.
#
# IMPORTANT — replicas: only ever run ONE instance of this image. JobBroker
# and CronScheduler run in-process (src/bootstrap.ts); a second replica
# double-fires every scheduled job. See docs/adr/0037 and
# plugins/workflow/docs/adr/0014-worker-deployment-architecture.md (design
# for a worker/scheduler split — not implemented).
COPY --chown=kb:nodejs plugins/workflow/daemon/.kb/kb.config.prod.json .kb/kb.config.default.json
COPY --chown=kb:nodejs plugins/workflow/daemon/.kb/marketplace.prod.lock .kb/marketplace.default.lock
COPY --chown=kb:nodejs plugins/workflow/daemon/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chown -R kb:nodejs .kb && chmod +x /app/docker-entrypoint.sh

USER kb

EXPOSE 7778

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
