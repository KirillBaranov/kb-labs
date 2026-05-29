# E2E OIDC IdP — standalone container for the OAuth auth E2E stack.
#
# Bundled with esbuild into a single self-contained ESM file so the image needs
# no monorepo context, no @kb-labs/devkit, and no runtime node_modules. The IdP
# is driven entirely by env (see src/bin.ts): IDP_ISSUER, IDP_CLIENT_ID,
# IDP_CLIENT_SECRET, IDP_TLS_KEY/CERT, IDP_AUTHORIZATION_ENDPOINT, etc.

# ── Build stage: bundle src/bin.ts → dist/bin.mjs ──────────────────────────────
FROM node:20-alpine AS build
WORKDIR /build
COPY src ./src
RUN npm install --no-save esbuild@0.24.0 jose@5.9.6 \
 && npx esbuild src/bin.ts \
      --bundle --platform=node --format=esm --target=node20 \
      --outfile=dist/bin.mjs

# ── Run stage: just node + the bundle ──────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=build /build/dist/bin.mjs ./bin.mjs
# Certs are mounted at runtime via the compose volume (IDP_TLS_KEY/CERT point at
# the mounted paths). Default port 9443 (https).
EXPOSE 9443
CMD ["node", "bin.mjs"]
