# syntax=docker/dockerfile:1
# Production image for the Pequeverso assistant backoffice (docs/deployment-contract.md).
# One image, two commands: `node server.js` (default) and `node scripts/db-migrate.ts` (one-shot
# migrations, run by the operator before starting a release that needs them).
# Base pinned by digest (node 24.21.0, Debian bookworm slim, linux/amd64 verified).
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.json ./
COPY src ./src
COPY public ./public
# `next build` type-checks with the project-local TypeScript 7 CLI; tests are excluded from the image.
RUN npx next build --webpack

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
LABEL org.opencontainers.image.source="https://github.com/gonzalomartinperez/pequeverso-assistant-web"
LABEL org.opencontainers.image.description="Pequeverso assistant private backoffice (operations dashboard and access)"
LABEL org.opencontainers.image.licenses="LicenseRef-Proprietary"
WORKDIR /app
ENV NODE_ENV=production BACKOFFICE_ENVIRONMENT=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Migrations: the runner needs only Node and `pg` (already traced into the standalone output).
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts/db-migrate.ts ./scripts/db-migrate.ts
RUN mkdir -p /app/.next/cache && chown node:node /app/.next/cache
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
