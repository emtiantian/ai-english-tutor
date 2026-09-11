# syntax=docker/dockerfile:1

# ── Build Stage ──
FROM node:22-alpine AS builder

# 使用国内镜像，避免容器内访问国外源超时/断连
RUN printf 'registry=https://registry.npmmirror.com\n' > /root/.npmrc
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
RUN npm install -g pnpm@10.7.1

WORKDIR /app

# Copy workspace files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/tutor-server/package.json apps/tutor-server/

# 国内网络下官方 registry 经常超时，将 lock 中的 tarball URL 替换为 npmmirror
RUN sed -i 's|https://registry.npmjs.org|https://registry.npmmirror.com|g' pnpm-lock.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile --registry https://registry.npmmirror.com

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

# Copy the deployed bundle (includes dist, package.json, and full node_modules)
COPY --from=builder /prod/server/dist ./dist
COPY --from=builder /prod/server/package.json ./package.json
COPY --from=builder /prod/server/node_modules ./node_modules

# Copy default vocabulary into the image. The loader falls back to
# DEFAULT_VOCAB_DIR when CONFIG_DIR/vocab/<level>.json is absent.
COPY config/vocab /app/config/vocab
ENV DEFAULT_VOCAB_DIR=/app/config/vocab

# Create the runtime configuration mount point
RUN mkdir -p /app/data /app/config

# Lock the runtime to deploy mode at the image level. config.ts keys deploy/dev
# off NODE_ENV; baking it in makes any `node dist/index.js` invocation here
# deploy-mode regardless of how the container is launched.
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
