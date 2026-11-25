# syntax=docker/dockerfile:1.20
# The Broccoli Access image: the API, the built web app and the migrations.
# Build from the repository root: docker build -f packages/api/Dockerfile .

FROM node:24.21.0-bookworm AS dependencies
WORKDIR /repo
RUN corepack enable
# Each build runs its own code generation after copying its sources.
COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json patches packages/*/package.json ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --parents packages/config packages/connector-contract ./

FROM dependencies AS api-build
COPY packages/api ./packages/api
# The API has no workspace runtime dependencies, so deploy can use legacy mode.
RUN pnpm build --filter=@broccoli-access/api \
  && pnpm --config.ignore-scripts=true --filter @broccoli-access/api deploy --legacy --prod /out/api

FROM dependencies AS web-build
# The web build reads the API schema for code generation.
COPY --parents packages/web packages/extension packages/api/src/**/*.graphql ./
RUN pnpm build --filter=@broccoli-access/web

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app/api
# A new named volume copies this folder's owner, so the app can write its secrets.
RUN mkdir /data && chown node:node /data
# The API and web can reuse their layers independently.
COPY --link --from=api-build /out/api ./
COPY --link --from=web-build /repo/packages/web/dist /app/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s \
  CMD ["node", "-e", "fetch('http://localhost:3000/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
