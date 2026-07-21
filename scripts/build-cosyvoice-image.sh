#!/usr/bin/env bash
# AI English Tutor — 自动构建 cosyvoice:local 镜像
# 用法: bash scripts/build-cosyvoice-image.sh
#
# 从 FunAudioLLM/CosyVoice 仓库克隆并构建 runtime/python/Dockerfile，
# 生成 tag 为 cosyvoice:local 的镜像，供 docker-compose.cosyvoice.yml 使用。

set -euo pipefail

REPO_URL="https://github.com/FunAudioLLM/CosyVoice.git"
BUILD_DIR="/tmp/cosyvoice-build-$$"
IMAGE_TAG="cosyvoice:local"
PROXY="${BUILD_PROXY:-http://127.0.0.1:7890}"

cleanup() {
  rm -rf "${BUILD_DIR}"
}
trap cleanup EXIT

echo "[INFO] 克隆 CosyVoice 仓库到 ${BUILD_DIR} ..."
git clone --recursive --depth 1 "${REPO_URL}" "${BUILD_DIR}"

cd "${BUILD_DIR}/runtime/python"

echo "[INFO] 构建 ${IMAGE_TAG}（使用宿主机网络与代理 ${PROXY}）..."
docker build --network host \
  --build-arg HTTP_PROXY="${PROXY}" \
  --build-arg HTTPS_PROXY="${PROXY}" \
  -t "${IMAGE_TAG}" .

echo "[INFO] 镜像 ${IMAGE_TAG} 构建完成"
