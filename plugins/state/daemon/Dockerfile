# syntax=docker/dockerfile:1
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# StateDaemonServer binds "localhost" by default (src/bootstrap.ts) — must be
# overridden for the process to accept traffic from outside the container.
ENV KB_STATE_DAEMON_HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# deploy/ produced on CI by: pnpm deploy --filter @kb-labs/core-state-daemon --prod .kb/deploy/state-daemon
COPY --chown=kb:nodejs .kb/deploy/state-daemon/node_modules ./node_modules
COPY --chown=kb:nodejs .kb/deploy/state-daemon/dist ./dist

# No adapters, no config: the broker is InMemoryStateBroker
# (core/state-broker/src/factory.ts) — nothing to mount, nothing to persist.
# State does not survive container recreation; that is current, expected
# behaviour, not a gap — see docs/adr/0037.

USER kb

EXPOSE 7777

CMD ["node", "dist/bin.cjs"]
