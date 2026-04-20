# KB Labs E2E — Platform container
#
# Stage 1 (go-builder): compiles kb-create and kb-dev from monorepo source so
# the E2E suite never needs kblabs.ru or GitHub releases to be reachable (CI-safe).
#
# Stage 2 (runtime): Node 20 image with the compiled binaries pre-installed.
# entrypoint.sh detects the pre-installed binaries and skips the remote
# install.sh download. kb-create then installs all @kb-labs/* packages from
# the Verdaccio local registry (started by the verdaccio Compose service),
# which is pre-populated from the monorepo build by the publisher service.
#
# Build:  docker build -t kb-e2e-platform -f e2e/platform/Dockerfile .
# Run:    docker compose -f e2e/docker-compose.yml up

# ── Stage 1: compile Go binaries ──────────────────────────────────────────
FROM golang:1.26-bookworm AS go-builder

ENV CGO_ENABLED=0

WORKDIR /src

COPY tools/kb-create /src/kb-create
COPY tools/kb-dev    /src/kb-dev

RUN cd /src/kb-create && go build -o /out/kb-create .
RUN cd /src/kb-dev    && go build -o /out/kb-dev .

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-bookworm

RUN apt-get update -qq && \
    apt-get install -y -qq curl ca-certificates git jq && \
    npm install -g pnpm@9 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "e2e@kblabs.test" && \
    git config --global user.name "KB Labs E2E"

# Pre-install binaries — entrypoint.sh skips kblabs.ru download when these exist
COPY --from=go-builder /out/kb-create /usr/local/bin/kb-create
COPY --from=go-builder /out/kb-dev    /usr/local/bin/kb-dev

# Manifest that points kb-create at the local Verdaccio registry
COPY e2e/platform/registry-manifest.json /e2e-registry-manifest.json

COPY e2e/platform/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000 5050 5070 7777 7778

CMD ["/entrypoint.sh"]
