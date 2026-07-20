#!/bin/bash
# ── AI English Tutor - Local Development Gateway ──
# 直接用生产 gateway/Dockerfile 构建镜像在本地跑，保证本地/生产网关配置
# 完全一致（nginx:alpine + envsubst），避免配置漂移。
#
# Usage:
#   ./gateway/dev.sh [port]        # 默认端口 8080
#   ./gateway/dev.sh 9000          # 自定义端口
#
# Architecture:
#   Browser -> Vite (6173) -> proxy /api/* -> Gateway (8080) -> Backend (3000)

set -e

GATEWAY_PORT="${1:-8080}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Starting AI English Tutor Gateway (dev)"
echo "   Gateway:  http://localhost:${GATEWAY_PORT}"
echo "   Backend:  http://localhost:3000"
echo "   Frontend: http://localhost:6173 (Vite dev server)"
echo ""
echo "   API requests via Vite proxy -> Gateway -> Backend"
echo "   Press Ctrl+C to stop"
echo ""

# 用生产 Dockerfile 构建（命中 layer cache 很快），entrypoint 负责 envsubst
docker build -f "${PROJECT_ROOT}/gateway/Dockerfile" -t ai-tutor-gateway:dev "${PROJECT_ROOT}" >/dev/null

# --add-host: map host.docker.internal to host machine（容器内访问宿主后端/前端）
# -p: map host port to container port 80
docker run --rm \
    -p "${GATEWAY_PORT}:80" \
    --add-host=host.docker.internal:host-gateway \
    -e "BACKEND_URL=http://host.docker.internal:3000" \
    -e "FRONTEND_URL=http://host.docker.internal:6173" \
    -e "CORS_ORIGIN=*" \
    --name ai-tutor-gateway \
    ai-tutor-gateway:dev
