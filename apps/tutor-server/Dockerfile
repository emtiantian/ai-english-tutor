# syntax=docker/dockerfile:1

# ── Build Stage ──
FROM node:22-alpine AS builder
RUN npm install -g pnpm@10.7.1

# Install native addon build tooling
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/tutor-server/package.json apps/tutor-server/

# Install dependencies (native addons built via onlyBuiltDependencies in pnpm-workspace.yaml)
RUN pnpm install --frozen-lockfile

# Ensure better-sqlite3 native bindings are built for this container
RUN pnpm rebuild better-sqlite3

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/tutor-server/ apps/tutor-server/

# Build shared package so backend imports compiled JS instead of TS source
RUN pnpm --filter @ai-english-tutor/shared build

# Build backend
RUN pnpm --filter @ai-english-tutor/server build

# Point shared package entry to compiled dist for deployment
RUN sed -i 's#"./src/index.ts"#"./dist/index.js"#g' packages/shared/package.json

# Deploy a self-contained production bundle (resolves pnpm symlinks)
RUN pnpm --filter @ai-english-tutor/server deploy --legacy --prod /prod/server

# ── Production Stage ──
FROM node:22-alpine
WORKDIR /app

# Install healthcheck tooling
RUN apk add --no-cache wget

# Copy the deployed bundle (includes dist, package.json, and full node_modules)
COPY --from=builder /prod/server/dist ./dist
COPY --from=builder /prod/server/package.json ./package.json
COPY --from=builder /prod/server/node_modules ./node_modules

# Copy default vocab lists into the compiled dist tree.
# loader.ts falls back to `__dirname/lists/<level>.json` (i.e. dist/vocab/lists)
# when CONFIG_DIR/vocab/<level>.json is absent. Without these files the
# fallback yields empty word lists in production.
COPY apps/tutor-server/src/vocab/lists ./dist/vocab/lists

# Create data directory for SQLite persistence and config mount point
RUN mkdir -p /app/data /app/config

# Lock the runtime to deploy mode at the image level. config.ts keys deploy/dev
# off NODE_ENV; baking it in makes any `node dist/index.js` invocation here
# deploy-mode regardless of how the container is launched.
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
