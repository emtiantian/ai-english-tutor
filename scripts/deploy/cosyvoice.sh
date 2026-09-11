#!/usr/bin/env bash
# AI English Tutor - 单独构建并部署 CosyVoice TTS（与主部署解耦）
# 用法: pnpm deploy:cosyvoice [--dry-run] [--skip-sync] [--proxy <url>]
#       远程目标可通过环境变量覆盖（默认与 push:server 一致）：
#         REMOTE_HOST=... REMOTE_USER=... REMOTE_DIR=... pnpm deploy:cosyvoice
#
# 说明：
#   - 主部署 push:server 不再自动构建 cosyvoice 镜像（避免构建失败拖累主程序）。
#   - 本命令负责：rsync 代码 -> docker compose build cosyvoice -> up -d cosyvoice -> 健康检查。
#   - 复用 scripts/deploy/lib/common.sh 的工具函数（remote_exec/dc/sync_code/test_build_proxy 等）。
#   - 仅当远端 .env 的 TTS_PROVIDER=cosyvoice 时才有意义；否则提示并退出。
#   - 镜像构建约 5-10 分钟，需代理 BUILD_PROXY（默认 http://127.0.0.1:7890，可用 --proxy 覆盖）。

set -euo pipefail

DRY_RUN=false
SKIP_SYNC=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    --dry-run)   DRY_RUN=true ;;
    --skip-sync) SKIP_SYNC=true ;;
    --proxy)     BUILD_PROXY="$2"; shift ;;
    --) ;;  # 忽略 pnpm 透传的 -- 分隔符
    *) echo "未知参数: $1" >&2; sed -n '2,10p' "$0"; exit 1 ;;
  esac
  shift
done

# ════════════════════════════════════════
# 配置（环境变量可覆盖；默认与 push:server 一致，个人用户直接用）
# ════════════════════════════════════════
REMOTE_HOST="${REMOTE_HOST:-100.100.132.72}"
REMOTE_USER="${REMOTE_USER:-haohe}"
REMOTE_DIR="${REMOTE_DIR:-/home/haohe/data/.ai-english-tutor}"
REMOTE_APP_DIR="${REMOTE_DIR}/app"
REMOTE_DATA_DIR="${REMOTE_DIR}/data"
REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_ENV_TEMP="${LOCAL_PROJECT_ROOT}/.env.deploy.generated"

# 加载公共部署库（提供 remote_exec / dc / log_* / sync_code / test_build_proxy /
# wait_cosyvoice_healthy / detect_compose_overlays / get_cosyvoice_health 等函数）
source "${LOCAL_PROJECT_ROOT}/scripts/deploy/lib/common.sh"

PROXY="${BUILD_PROXY:-http://127.0.0.1:7890}"

log_info "=== CosyVoice 单独部署开始 ==="
log_info "服务器：${REMOTE_USER}@${REMOTE_HOST}（dry-run=${DRY_RUN}，skip-sync=${SKIP_SYNC}，代理 ${PROXY}）"

check_ssh
ensure_remote_dirs

# 1. 同步代码（确保远端 Dockerfile / compose 最新）；--skip-sync 时跳过（调试用）
if $SKIP_SYNC; then
  log_warn "--skip-sync：跳过 rsync，使用远端现有代码（请确保 Dockerfile 已是最新）"
else
  sync_code
fi

# 2. 探测远端 TTS_PROVIDER，确认 cosyvoice 已启用
detect_compose_overlays
if ! $ENABLE_COSYVOICE; then
  log_error "远端 .env 的 TTS_PROVIDER 非 cosyvoice，无需部署 CosyVoice"
  log_error "  若需启用，请先在 .env 设置 TTS_PROVIDER=cosyvoice 并跑 pnpm push:server 部署主程序"
  exit 1
fi

# 3. 测试 build 代理（含 GitHub 可达性探测，CosyVoice Dockerfile 内 git clone GitHub）
test_build_proxy

# 4. 构建 cosyvoice:local 镜像（走 compose build 块，与主部署同一入口）
if $DRY_RUN; then
  log_dry "将执行: docker compose build cosyvoice --build-arg HTTP_PROXY=${PROXY} --build-arg HTTPS_PROXY=${PROXY}"
else
  log_info "构建 cosyvoice:local 镜像（约 5-10 分钟，代理 ${PROXY}）..."
  if ! dc_tty "build cosyvoice --build-arg HTTP_PROXY=${PROXY} --build-arg HTTPS_PROXY=${PROXY}"; then
    log_error "CosyVoice 镜像构建失败"
    cat >&2 <<HINT

${YELLOW}[手动排查]${NC} 构建依赖代理拉取 GitHub 源码与 pytorch 基础镜像：

  ${GREEN}# 1. 确认远端代理可达 GitHub${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \
    "curl -fsS -o /dev/null --max-time 10 --proxy ${PROXY} https://github.com"

  ${GREEN}# 2. 查看详细构建日志重试${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \
    "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} \
       -f docker-compose.yml -f docker-compose.cosyvoice.yml build cosyvoice"

  ${GREEN}# 3. 基础镜像 pytorch:2.0.1-cuda11.7 拉取慢/失败时，为 docker daemon 配镜像加速${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} "cat /etc/docker/daemon.json"

镜像就绪后重新运行 pnpm deploy:cosyvoice 即可（已构建则自动跳过）。
HINT
    exit 1
  fi
  log_info "cosyvoice:local 镜像构建完成"
fi

# 5. 兜底确保 tutor-net 网络存在（主程序未起时网络可能缺失，cosyvoice 依赖该网络）
if ! $DRY_RUN; then
  remote_exec "docker network create tutor-net 2>/dev/null || true"
fi

# 6. 启动 cosyvoice 服务（单服务 up，复用刚构建的镜像）
if $DRY_RUN; then
  log_dry "将执行: docker compose up -d cosyvoice"
else
  log_info "启动 cosyvoice 容器..."
  if ! dc_tty "up -d cosyvoice"; then
    log_error "cosyvoice 容器启动失败"
    exit 1
  fi
fi

# 7. 等待健康
wait_cosyvoice_healthy

# 8. 端到端探测
if $DRY_RUN; then
  log_dry "将执行: curl -X POST -F spk_id=EnglishTutor http://localhost:50000/inference_sft"
else
  log_info "CosyVoice 端到端探测..."
  cv_status=$(remote_exec_real "curl -s -o /dev/null -w '%{http_code}' -X POST -F 'spk_id=EnglishTutor' http://localhost:50000/inference_sft" || true)
  if [ "${cv_status}" = "422" ] || [ "${cv_status}" = "200" ]; then
    log_info "CosyVoice 端到端探测通过 (HTTP ${cv_status})"
  else
    log_warn "CosyVoice 端到端探测未通过 (HTTP ${cv_status})，请稍后检查 docker compose logs cosyvoice"
  fi
fi

# 9. 报告
echo ""
if $DRY_RUN; then
  echo "================ CosyVoice 预计部署报告 ================"
  echo "服务器：            ${REMOTE_USER}@${REMOTE_HOST}"
  echo "结果：              dry-run 完成"
else
  echo "================ CosyVoice 部署报告 ================"
  echo "服务器：            ${REMOTE_USER}@${REMOTE_HOST}"
  echo "容器状态："
  dc "ps --format 'table {{.Name}}\t{{.Status}}' cosyvoice" || true
  echo "CosyVoice：         $(get_cosyvoice_health)"
  echo "结果：              成功"
fi
echo "======================================================"
