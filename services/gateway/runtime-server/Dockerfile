FROM node:24-alpine

WORKDIR /app

# Copy bundled artifacts (built with DOCKER_BUILD=1, all deps inlined)
COPY dist/ ./dist/

# The runtime only needs to read the bundled application and must not run as
# root if a plugin or request handler is compromised.
USER node

# Required env vars (injected by workflow-daemon at container create):
#   GATEWAY_WS_URL    — WebSocket URL of the Gateway, e.g. ws://kb-gateway:4000
#   RUNTIME_HOST_ID   — Deterministic hostId, e.g. runtime-abc123
#   GATEWAY_TOKEN     — Bearer token for WS auth
CMD ["node", "dist/cli.cjs"]
