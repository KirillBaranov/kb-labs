# KB Labs E2E — Full install flow test
#
# Simulates a fresh machine: Node 24, pnpm, git, curl — nothing else.
# Runs test.sh which installs KB Labs from kblabs.ru and exercises
# the full user journey.
#
# Build:  docker build -t kb-e2e -f e2e/install-flow/Dockerfile e2e/install-flow
# Run:    docker run --rm kb-e2e

FROM node:24-bullseye

RUN apt-get update -qq && \
    apt-get install -y -qq curl ca-certificates git jq && \
    npm install -g pnpm@11.4.0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "e2e@kblabs.test" && \
    git config --global user.name "KB Labs E2E"

WORKDIR /e2e
COPY test.sh /e2e/test.sh
RUN chmod +x /e2e/test.sh

CMD ["/e2e/test.sh"]
