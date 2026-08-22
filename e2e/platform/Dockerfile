# KB Labs E2E — Platform container
#
# Stage 1 (go-builder): compiles kb-create and kb-dev from monorepo source so
# the E2E suite never needs kblabs.ru or GitHub releases to be reachable (CI-safe).
#
# Stage 2 (runtime): Node 24 image with the compiled binaries pre-installed.
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

# clikit is a workspace-local Go module shared by the tool binaries via a
# `replace github.com/kb-labs/clikit => ../clikit` directive. The isolated
# Docker build context must include it or `go build` fails with
# "replacement directory ../clikit does not exist".
COPY tools/clikit    /src/clikit
COPY tools/kb-create /src/kb-create
COPY tools/kb-dev    /src/kb-dev
COPY tools/kb-devkit /src/kb-devkit

RUN cd /src/kb-create && go build -o /out/kb-create .
RUN cd /src/kb-create && go build -o /out/kb-create-release-index ./v2/cmd/kb-create-release-index
RUN cd /src/kb-dev    && go build -o /out/kb-dev .
RUN cd /src/kb-devkit && go build -o /out/kb-devkit .

# Build the sealed V2 index from the exact package tarballs that the publisher
# exposes through Verdaccio. This uses the same sealer as the release pipeline.
FROM node:24-bookworm AS release-index-builder

WORKDIR /src
COPY e2e/packages /src/packages
COPY e2e/platform/registry-manifest.json /src/registry-manifest.json
COPY e2e/platform/prepare-release-index.mjs /src/prepare-release-index.mjs
COPY tools/kb-create/scripts/prepare-release-index.mjs /src/kb-create/scripts/prepare-release-index.mjs
COPY --from=go-builder /out/kb-create-release-index /usr/local/bin/kb-create-release-index
RUN node /src/prepare-release-index.mjs \
      --packages-dir /src/packages \
      --registry-manifest /src/registry-manifest.json \
      --sealer /usr/local/bin/kb-create-release-index \
      --output /out/release-index.json

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:24-bookworm

RUN apt-get update -qq && \
    apt-get install -y -qq curl ca-certificates git jq && \
    npm install -g pnpm@11.4.0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "e2e@kblabs.test" && \
    git config --global user.name "KB Labs E2E"

# Pre-install binaries — entrypoint.sh skips kblabs.ru download when these exist
COPY --from=go-builder /out/kb-create /usr/local/bin/kb-create
COPY --from=go-builder /out/kb-dev    /usr/local/bin/kb-dev
COPY --from=go-builder /out/kb-devkit /usr/local/bin/kb-devkit
COPY --from=release-index-builder /out/release-index.json /release-index.json

# Manifest that points kb-create at the local Verdaccio registry
COPY e2e/platform/registry-manifest.json /e2e-registry-manifest.json

COPY e2e/platform/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000 5050 5070 7777 7778

CMD ["/entrypoint.sh"]
