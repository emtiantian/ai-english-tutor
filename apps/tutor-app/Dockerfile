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
ARG VITE_LIVE2D_MAX_DPR=
ARG VITE_LIVE2D_TARGET_FPS=
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_LIVE2D_MAX_DPR=${VITE_LIVE2D_MAX_DPR}
ENV VITE_LIVE2D_TARGET_FPS=${VITE_LIVE2D_TARGET_FPS}
RUN pnpm --filter tutor-app build

# 构建阶段预压缩文本静态资源。运行时 Nginx 直接发送同名 .gz，
# 避免每次请求动态压缩占用服务器 CPU；原文件保留给不支持 gzip 的客户端。
RUN find apps/tutor-app/dist -type f -size +1024c \
    \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.json' \
       -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' -o -name '*.wasm' \) \
    -exec gzip -9 -k {} \;

# ── Serve Stage ──
FROM nginx:alpine
COPY --from=builder /app/apps/tutor-app/dist /usr/share/nginx/html
COPY apps/tutor-app/nginx.conf /etc/nginx/conf.d/default.conf
# 配置和静态文件已在构建期固定，不需要官方入口脚本再次改写配置。
# 直接使用基础镜像的 CMD 启动 Nginx，避免入口脚本调用 apk manifest 时阻塞启动。
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 80
