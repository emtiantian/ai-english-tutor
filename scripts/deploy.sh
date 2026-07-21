#!/usr/bin/env bash
# AI English Tutor — 通用部署脚本（他人使用，从环境变量读取目标）
# 用法:
#   REMOTE_HOST=your-host REMOTE_USER=your-user REMOTE_DIR=/opt/ai-english-tutor \
#     ./scripts/deploy.sh [--use-local-env] [--skip-tests]
#
# 流程与 deploy-to-server.sh 相同，但不硬编码任何服务器地址。

set -euo pipefail

USE_LOCAL_ENV=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    --use-local-env) USE_LOCAL_ENV=true ;;
    --skip-tests)    SKIP_TESTS=true ;;
    *)         echo "未知参数: $1" >&2; sed -n '2,8p' "$0"; exit 1 ;;
  esac
  shift
done

# ════════════════════════════════════════
# 配置（从环境变量读取，无硬编码）
# ════════════════════════════════════════
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"

if [ -z "${REMOTE_HOST}" ]; then
  echo "[ERROR] 请设置 REMOTE_HOST 环境变量" >&2
  echo "  示例: REMOTE_HOST=100.100.132.72 REMOTE_USER=haohe ./scripts/deploy.sh" >&2
  exit 1
fi

if [ -z "${REMOTE_USER}" ]; then
  echo "[ERROR] 请设置 REMOTE_USER 环境变量" >&2
  exit 1
fi

if [ -z "${REMOTE_DIR}" ]; then
  REMOTE_DIR="/home/${REMOTE_USER}/.ai-english-tutor"
  echo "[INFO] REMOTE_DIR 未设置，使用默认值: ${REMOTE_DIR}" >&2
fi

REMOTE_APP_DIR="${REMOTE_DIR}/app"
REMOTE_DATA_DIR="${REMOTE_DIR}/data"
REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV_TEMP="${LOCAL_PROJECT_ROOT}/.env.deploy.generated"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DATA_DIR="${REMOTE_BACKUP_DIR}/data-${TIMESTAMP}"
BACKUP_APP_DIR="${REMOTE_BACKUP_DIR}/app-${TIMESTAMP}"

# 加载公共部署库
source "${LOCAL_PROJECT_ROOT}/scripts/lib/deploy-common.sh"

# 启动主流程
deploy_main
