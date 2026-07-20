# syntax=docker/dockerfile:1

# ── Build Stage ──
FROM node:22-alpine AS builder
# 使用国内镜像，避免容器内访问国外源超时/断连
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN npm install -g pnpm@10.7.1

WORKDIR /app

# Copy workspace files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/tutor-app/package.json apps/tutor-app/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/tutor-app/ apps/tutor-app/

# Build frontend with VITE_* injected at build time（来自 docker-compose build args）
# VITE_BACKEND_URL 留空 = 同源请求（gateway 反代 /api/*）
ARG VITE_BACKEND_URL=
ARG VITE_CHARACTER_PROVIDER=live2d
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_CHARACTER_PROVIDER=${VITE_CHARACTER_PROVIDER}
RUN pnpm --filter tutor-app build

# ── Serve Stage ──
FROM nginx:alpine
COPY --from=builder /app/apps/tutor-app/dist /usr/share/nginx/html
EXPOSE 80
