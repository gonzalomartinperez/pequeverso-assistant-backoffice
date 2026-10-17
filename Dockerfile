# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Production image for the Pequeverso assistant backoffice (docs/deployment-contract.md).
# One image, two commands: `node server.js` (default) and `node scripts/db-migrate.ts` (one-shot
# migrations, run by the operator before starting a release that needs them).
# Base pinned by digest (node 24.22.0, Debian trixie slim, linux/amd64 verified).
FROM node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.json ./
COPY src ./src
COPY public ./public
# `next build` type-checks with the project-local TypeScript 7 CLI; tests are excluded from the image.
RUN npx next build --webpack

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b AS runtime
LABEL org.opencontainers.image.source="https://github.com/gonzalomartinperez/pequeverso-backoffice"
LABEL org.opencontainers.image.description="Pequeverso private backoffice (access and assistant operations)"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin
ENV NODE_ENV=production BACKOFFICE_ENVIRONMENT=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --chown=65532:65532 LICENSE NOTICE.md THIRD_PARTY_NOTICES.md ./
COPY --from=build --chown=65532:65532 /app/.next/standalone ./
COPY --from=build --chown=65532:65532 /app/.next/static ./.next/static
COPY --from=build --chown=65532:65532 /app/public ./public
# Migrations: the runner needs only Node and `pg` (already traced into the standalone output).
COPY --chown=65532:65532 migrations ./migrations
COPY --chown=65532:65532 scripts/db-migrate.ts ./scripts/db-migrate.ts
USER 65532:65532
ENTRYPOINT []
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
