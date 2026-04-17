# KB Labs E2E — Platform container
#
# Installs KB Labs from kblabs.ru (real prod install) and starts
# core backend services. State-daemon is in-memory — no external infra needed.
#
# Build:  docker build -t kb-e2e-platform -f e2e/platform/Dockerfile .
# Run:    docker run --rm -p 4000:4000 -p 5050:5050 kb-e2e-platform

FROM node:20-bullseye

RUN apt-get update -qq && \
    apt-get install -y -qq curl ca-certificates git jq && \
    npm install -g pnpm@9 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "e2e@kblabs.test" && \
    git config --global user.name "KB Labs E2E"

COPY e2e/platform/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000 5050 5070 7777 7778

CMD ["/entrypoint.sh"]
