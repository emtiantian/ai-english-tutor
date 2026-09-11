# syntax=docker/dockerfile:1

# ── Build Stage ──
FROM node:22-alpine AS builder
# 使用国内镜像，避免容器内访问国外源超时/断连
RUN echo "registry=https://registry.npmmirror.com" > /root/.npmrc
RUN npm install -g pnpm@10.7.1

WORKDIR /app

# Copy workspace files first (for layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/tutor-app/package.json apps/tutor-app/

# 国内网络下官方 registry 经常超时，将 lock 中的 tarball URL 替换为 npmmirror
RUN sed -i 's|https://registry.npmjs.org|https://registry.npmmirror.com|g' pnpm-lock.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile --registry https://registry.npmmirror.com

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/tutor-app/ apps/tutor-app/

# Build frontend with VITE_* injected at build time（来自 docker-compose build args）
# VITE_BACKEND_URL 留空 = 同源请求（gateway 反代 /api/*）
ARG VITE_BACKEND_URL=
ARG VITE_CHARACTER_PROVIDER=live2d
ARG VITE_LIVE2D_MODEL_ID=
ARG VITE_LIVE2D_MAX_DPR=
ARG VITE_LIVE2D_TARGET_FPS=
ARG VITE_RIVE_SRC=
ARG VITE_RIVE_STATE_MACHINE=
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_CHARACTER_PROVIDER=${VITE_CHARACTER_PROVIDER}
ENV VITE_LIVE2D_MODEL_ID=${VITE_LIVE2D_MODEL_ID}
ENV VITE_LIVE2D_MAX_DPR=${VITE_LIVE2D_MAX_DPR}
ENV VITE_LIVE2D_TARGET_FPS=${VITE_LIVE2D_TARGET_FPS}
ENV VITE_RIVE_SRC=${VITE_RIVE_SRC}
ENV VITE_RIVE_STATE_MACHINE=${VITE_RIVE_STATE_MACHINE}
RUN pnpm --filter tutor-app build

# ── Serve Stage ──
FROM nginx:alpine
COPY --from=builder /app/apps/tutor-app/dist /usr/share/nginx/html
EXPOSE 80
