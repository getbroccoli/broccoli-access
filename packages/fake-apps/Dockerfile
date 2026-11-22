# The fake connectors container (docs/fake-apps.md), which the conformance suite runs with a
# read-only root file system. Tests only: it is never part of the production image.
# Build from the repository root: docker build -f packages/fake-apps/Dockerfile .

FROM node:24.21.0-bookworm-slim
WORKDIR /repo
# Corepack installs the pnpm version pinned in package.json.
RUN corepack enable
COPY . .
# --ignore-scripts: the root's postinstall generates code for the other packages.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @broccoli-access/fake-apps...
USER node
WORKDIR /repo/packages/fake-apps
EXPOSE 4000
# tsx keeps its cache in /tmp, the one folder the contract leaves writable.
CMD ["node_modules/.bin/tsx", "src/connectorsMain.ts"]
