#!/usr/bin/env bash
# AI English Tutor - 构建 cosyvoice:local 镜像
# 用法: bash scripts/build-cosyvoice-image.sh
#
# 使用本仓库 scripts/cosyvoice/Dockerfile 构建（CosyVoice 官方未发布镜像，
# Dockerfile 内部 git clone 源码），生成 tag 为 cosyvoice:local 的镜像，
# 供 docker-compose.cosyvoice.yml 使用。
#
# 等价于：
#   docker compose -f docker-compose.yml -f docker-compose.cosyvoice.yml build cosyvoice
# 本脚本仅作为独立构建/调试入口；部署流程由 ensure_cosyvoice_image 走 compose build。
#
# 代理：默认 http://127.0.0.1:7890，可用 BUILD_PROXY 环境变量覆盖；
#   --network host 让容器内 127.0.0.1:7890 直达宿主机代理。

set -euo pipefail

IMAGE_TAG="cosyvoice:local"
PROXY="${BUILD_PROXY:-http://127.0.0.1:7890}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTEXT_DIR="${SCRIPT_DIR}/cosyvoice"

echo "[INFO] 构建 ${IMAGE_TAG}（context=${CONTEXT_DIR}，代理 ${PROXY}）..."
docker build --network host \
  --build-arg HTTP_PROXY="${PROXY}" \
  --build-arg HTTPS_PROXY="${PROXY}" \
  -t "${IMAGE_TAG}" \
  -f "${CONTEXT_DIR}/Dockerfile" \
  "${CONTEXT_DIR}"

echo "[INFO] 镜像 ${IMAGE_TAG} 构建完成"
