# syntax=docker/dockerfile:1

# ── Build Stage ──
FROM node:22-alpine AS builder

# 使用国内镜像，避免容器内访问国外源超时/断连
RUN printf 'registry=https://registry.npmmirror.com\nbetter-sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3\n' > /root/.npmrc
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
RUN npm install -g pnpm@10.7.1

# Install native addon build tooling
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/tutor-server/package.json apps/tutor-server/

# Install dependencies (native addons built via onlyBuiltDependencies in pnpm-workspace.yaml)
RUN pnpm install --frozen-lockfile --registry https://registry.npmmirror.com

# Ensure better-sqlite3 native bindings are built for this container
RUN pnpm rebuild better-sqlite3

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/tutor-server/ apps/tutor-server/

# Build shared package so backend imports compiled JS instead of TS source
RUN pnpm --filter @ai-english-tutor/shared build

# Build backend
RUN pnpm --filter @ai-english-tutor/server build

# 迁移 SQL 文件不会被 tsc 自动复制到 dist，需显式复制
COPY apps/tutor-server/src/db/migrations/*.sql /app/dist/db/migrations/

# Point shared package entry to compiled dist for deployment
RUN sed -i 's#"./src/index.ts"#"./dist/index.js"#g' packages/shared/package.json

# Deploy a self-contained production bundle (resolves pnpm symlinks)
RUN pnpm --filter @ai-english-tutor/server deploy --legacy --prod /prod/server

# ── Production Stage ──
FROM node:22-alpine
WORKDIR /app

# Install healthcheck tooling + ffmpeg (required for Volcengine ASR audio conversion)
RUN apk add --no-cache wget ffmpeg

# Copy the deployed bundle (includes dist, package.json, and full node_modules)
COPY --from=builder /prod/server/dist ./dist
COPY --from=builder /prod/server/package.json ./package.json
COPY --from=builder /prod/server/node_modules ./node_modules

# 迁移 SQL 文件不会被 pnpm deploy 复制到 /prod/server，需从 builder 显式复制
COPY --from=builder /app/dist/db/migrations/*.sql ./dist/db/migrations/

# Copy default vocabulary into the image. The loader falls back to
# DEFAULT_VOCAB_DIR when CONFIG_DIR/vocab/<level>.json is absent.
COPY config/vocab /app/config/vocab
ENV DEFAULT_VOCAB_DIR=/app/config/vocab

# Create data directory for SQLite persistence and config mount point
RUN mkdir -p /app/data /app/config

# Lock the runtime to deploy mode at the image level. config.ts keys deploy/dev
# off NODE_ENV; baking it in makes any `node dist/index.js` invocation here
# deploy-mode regardless of how the container is launched.
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
