# syntax=docker/dockerfile:1
#
# Fixture proving the fail-fast composition mechanism, not a real service.
# Reuses the REAL docker-entrypoint.sh shipped in services/gateway/app/ —
# not a reimplementation — so a pass here is evidence about the actual
# shipped artifact, not a simulation of it. See e2e/deploy/config-override/README.md.
#
# Build from the REPO ROOT as context:
#   docker build -f e2e/deploy/config-override/Dockerfile -t kb-config-override-fixture .
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs kb

# The real, shipped entrypoint — same file gateway/marketplace-registry/rest-api
# use. This is the thing under test.
COPY --chown=kb:nodejs services/gateway/app/docker-entrypoint.sh /app/docker-entrypoint.sh

# Fixture composition — deliberately NOT the real gateway config, so a pass
# here proves fail-fast behaviour, not gateway-specific behaviour.

RUN chown -R kb:nodejs .kb && chmod +x /app/docker-entrypoint.sh

USER kb

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No real app — the fixture's only job is to print whichever config ended up
# live, so the test driver can tell default vs mounted-override apart.
CMD ["cat", "/app/.kb/kb.config.json"]
