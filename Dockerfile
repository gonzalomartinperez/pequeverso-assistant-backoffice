# syntax=docker/dockerfile:1
# Production image for pequeverso-assistant-web (docs/deployment-contract.md).
# Base pinned by digest (node 24.21.0, Debian bookworm slim, linux/amd64 verified).
FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.json ./
COPY src ./src
COPY public ./public
# `next build` type-checks with the project-local TypeScript 7 CLI; tests are excluded from the image.
RUN npx next build --webpack

FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime
LABEL org.opencontainers.image.source="https://github.com/gonzalomartinperez/pequeverso-assistant-web"
LABEL org.opencontainers.image.description="Pequeverso shopping assistant frontend (standalone and embedded)"
LABEL org.opencontainers.image.licenses="LicenseRef-Proprietary"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/.next/cache && chown node:node /app/.next/cache
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
