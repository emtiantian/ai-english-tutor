#!/usr/bin/env bash
# ── AI English Tutor — 远程 ASR Docker 一键测试 ──
# 用法: ./scripts/test-remote-asr.sh [测试音频路径]
#
# 默认会尝试调用 ./scripts/generate-test-audio.sh 生成标准测试音频，
# 也可以手动指定任意 16kHz mono MP3：
#   ./scripts/test-remote-asr.sh /path/to/test.mp3
#
# 测试分层：
#   L1 容器状态 → L2 whisper 健康 → L3 直接推理 → L4 后端 API

set -euo pipefail

# ════════════════════════════════════════
# 配置（与 deploy-to-server.sh 保持一致）
# ════════════════════════════════════════
REMOTE_HOST="100.100.132.72"
REMOTE_USER="haohe"
# 与 deploy-to-server.sh 默认值保持一致；可用 AI_TUTOR_REMOTE_DIR 覆盖
REMOTE_DIR="${AI_TUTOR_REMOTE_DIR:-/home/haohe/data/.ai-english-tutor}"
REMOTE_APP_DIR="${REMOTE_DIR}/app"
REMOTE_TMP_AUDIO="/tmp/ai-tutor-test-asr.mp3"
# L4 后端 API 协议：默认 http；HTTPS（如 mkcert 自签）设 REMOTE_SCHEME=https
REMOTE_SCHEME="${REMOTE_SCHEME:-http}"

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUDIO_GENERATOR="${LOCAL_PROJECT_ROOT}/scripts/generate-test-audio.sh"

# docker compose project 名来自 docker-compose.yml 顶层的 name: ai-english-tutor
PROJECT_NAME="ai-english-tutor"
WHISPER_CONTAINER="${PROJECT_NAME}-whisper-1"
TUTOR_NETWORK="tutor-net"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

PASS=0
FAIL=0

# ════════════════════════════════════════
# 工具函数
# ════════════════════════════════════════
log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }
log_step()  { echo ""; echo "${BLUE}[STEP $1]${NC} $2"; }

remote_exec() {
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

ok() {
  echo "${GREEN}✓${NC} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "${RED}✗${NC} $1"
  FAIL=$((FAIL + 1))
  if [ -n "${2:-}" ]; then
    echo "  ${YELLOW}提示:${NC} $2"
  fi
}

# ════════════════════════════════════════
# 准备测试音频
# ════════════════════════════════════════
prepare_audio() {
  log_step "0" "准备测试音频"

  local input_audio="${1:-}"

  if [ -n "${input_audio}" ]; then
    if [ ! -f "${input_audio}" ]; then
      log_error "指定音频不存在: ${input_audio}"
      exit 1
    fi
    log_info "使用指定音频: ${input_audio}"
    TEST_AUDIO="${input_audio}"
    return
  fi

  if [ -f "${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3" ]; then
    log_info "使用已存在的测试音频: ${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3"
    TEST_AUDIO="${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3"
    return
  fi

  if [ -x "${AUDIO_GENERATOR}" ]; then
    log_info "未指定音频，调用生成器..."
    mkdir -p "${LOCAL_PROJECT_ROOT}/.dev-data"
    "${AUDIO_GENERATOR}" "${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3"
    TEST_AUDIO="${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3"
    return
  fi

  log_error "未找到 ${AUDIO_GENERATOR}，且未指定音频"
  exit 1
}

# ════════════════════════════════════════
# L1 容器状态
# ════════════════════════════════════════
level1_container() {
  log_step "1" "检查 Whisper 容器状态"

  local status
  status=$(remote_exec "cd ${REMOTE_APP_DIR} && docker compose ps whisper --format 'table {{.Name}}\t{{.Status}}\t{{.Health}}'" 2>/dev/null || true)

  if [ -z "${status}" ]; then
    fail "无法获取容器状态" "确认远程 ${REMOTE_APP_DIR} 存在且 docker compose 正常"
    return 1
  fi

  echo "${status}"

  if echo "${status}" | grep -qE "Up|running"; then
    ok "Whisper 容器正在运行"
  else
    fail "Whisper 容器未运行"
    return 1
  fi
}

# ════════════════════════════════════════
# L2 健康检查
# ════════════════════════════════════════
level2_health() {
  log_step "2" "检查 Whisper 服务健康"

  local health
  health=$(remote_exec "docker run --rm --network ${TUTOR_NETWORK} alpine sh -c 'apk add --no-cache curl >/dev/null 2>&1 && curl -s -o /dev/null -w %{http_code} http://whisper:8080/health'" 2>/dev/null || true)

  if [ "${health}" = "200" ]; then
    ok "Whisper /health 返回 200"
  else
    fail "Whisper /health 异常 (http_code=${health:-unknown})" "模型可能还在加载，查看日志: docker logs ${WHISPER_CONTAINER}"
    return 1
  fi
}

# ════════════════════════════════════════
# L3 直接推理
# ════════════════════════════════════════
level3_direct_inference() {
  log_step "3" "直接调用 Whisper 推理"

  log_info "上传测试音频到远程 ${REMOTE_TMP_AUDIO}..."
  scp -q "${TEST_AUDIO}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP_AUDIO}"

  local result
  result=$(remote_exec "docker run --rm --network ${TUTOR_NETWORK} -v /tmp:/tmp alpine sh -c 'apk add --no-cache curl >/dev/null 2>&1 && curl -s -X POST http://whisper:8080/inference -F file=@${REMOTE_TMP_AUDIO} -F response_format=json'" 2>/dev/null || true)

  if [ -z "${result}" ]; then
    fail "Whisper 推理无返回"
    return 1
  fi

  echo "  返回: ${result}"

  if echo "${result}" | grep -q '"text"'; then
    ok "Whisper 直接推理成功"
  else
    fail "Whisper 直接推理返回异常" "检查音频格式是否为 16kHz mono MP3"
    return 1
  fi
}

# ════════════════════════════════════════
# L4 后端 API
# ════════════════════════════════════════
level4_backend_api() {
  log_step "4" "通过后端 API 测试 ASR"

  local result
  # -k 允许 mkcert 自签证书；协议由 REMOTE_SCHEME 控制
  result=$(curl -s -k -X POST "${REMOTE_SCHEME}://${REMOTE_HOST}/api/asr" \
    -F "file=@${TEST_AUDIO};type=audio/mpeg" 2>/dev/null || true)

  if [ -z "${result}" ]; then
    fail "后端 /api/asr 无返回" "确认 gateway/backend 是否健康"
    return 1
  fi

  echo "  返回: ${result}"

  if echo "${result}" | grep -q '"text"'; then
    ok "后端 /api/asr 调用成功"
  else
    fail "后端 /api/asr 返回异常" "检查后端 WHISPER_BASE_URL 与 ASR_PROVIDER 配置"
    return 1
  fi
}

# ════════════════════════════════════════
# 报告
# ════════════════════════════════════════
print_report() {
  echo ""
  echo "================ ASR 远程测试报告 ================"
  echo "服务器: ${REMOTE_USER}@${REMOTE_HOST}"
  echo "测试音频: ${TEST_AUDIO}"
  echo "通过: ${GREEN}${PASS}${NC}  失败: ${RED}${FAIL}${NC}"
  echo "=================================================="

  if [ ${FAIL} -gt 0 ]; then
    echo ""
    echo "${YELLOW}故障排查速查:${NC}"
    echo "  L1 失败 → docker compose up -d whisper"
    echo "  L2 失败 → docker logs ${WHISPER_CONTAINER}（模型加载中/崩溃）"
    echo "  L3 失败 → 音频格式不对，或模型未就绪"
    echo "  L4 失败 → 后端 .env 中 WHISPER_BASE_URL/ASR_PROVIDER 配置错误"
    exit 1
  fi
}

# ════════════════════════════════════════
# Main
# ════════════════════════════════════════
main() {
  log_info "远程 ASR 测试开始"
  log_info "目标服务器: ${REMOTE_USER}@${REMOTE_HOST}"

  prepare_audio "${1:-}"

  # 各层顺序执行，上一层失败仍继续跑下一层，方便一次性拿到全部诊断信息
  level1_container || true
  level2_health || true
  level3_direct_inference || true
  level4_backend_api || true

  print_report
}

main "$@"
