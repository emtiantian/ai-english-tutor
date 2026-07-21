#!/usr/bin/env bash
# AI English Tutor — 一键部署到服务器（个人使用，硬编码目标）
# 用法: ./scripts/deploy-to-server.sh [--use-local-env] [--skip-tests] [--non-interactive-env]
#
# 流程: git clean → ssh 检查 → 交互式 .env → rsync → docker compose up → 健康检查 → 报告
# 默认最小栈: 浏览器 ASR/TTS + mock LLM；需要时自动叠加 whisper / cosyvoice compose。

set -euo pipefail

USE_LOCAL_ENV=false
SKIP_TESTS=false
NONINTERACTIVE_ENV=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    --use-local-env)       USE_LOCAL_ENV=true ;;
    --skip-tests)          SKIP_TESTS=true ;;
    --non-interactive-env) NONINTERACTIVE_ENV=true ;;
    --) ;;  # 忽略 pnpm 透传的 -- 分隔符（由外层 shift 跳过），支持 `pnpm push:server -- --use-local-env`
    *)         echo "未知参数: $1" >&2; sed -n '2,5p' "$0"; exit 1 ;;
  esac
  shift
done

# ════════════════════════════════════════
# 配置（个人使用，硬编码）
# ════════════════════════════════════════
REMOTE_HOST="100.100.132.72"
REMOTE_USER="haohe"
REMOTE_DIR="/home/haohe/data/.ai-english-tutor"
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
