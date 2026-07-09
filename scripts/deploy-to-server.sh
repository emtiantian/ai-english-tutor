#!/usr/bin/env bash
# AI English Tutor — 一键部署到服务器
# 用法: ./scripts/deploy-to-server.sh
#
# 流程: git clean → ssh 检查 → 交互式 .env → rsync → docker compose up → 健康检查 → 报告
# 默认最小栈: 浏览器 ASR/TTS + DeepSeek LLM；需要时自动叠加 whisper / cosyvoice compose。

set -euo pipefail

if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *)         echo "未知参数: $1" >&2; sed -n '2,5p' "$0"; exit 1 ;;
  esac
fi

# ════════════════════════════════════════
# 配置
# ════════════════════════════════════════
REMOTE_HOST="100.100.132.72"
REMOTE_USER="haohe"
REMOTE_DIR_DEFAULT="/home/haohe/data/.ai-english-tutor"
REMOTE_DIR="${REMOTE_DIR_DEFAULT}"
REMOTE_APP_DIR="${REMOTE_DIR}/app"
REMOTE_DATA_DIR="${REMOTE_DIR}/data"
REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV_TEMP="${LOCAL_PROJECT_ROOT}/.env.deploy.generated"

WHISPER_MODEL_FILE="${WHISPER_MODEL:-ggml-base.en.bin}"
WHISPER_MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}"

RSYNC_EXCLUDES=(
  '.git'
  'node_modules'
  '.pnpm-store'
  '.codegraph'
  'dist'
  '.DS_Store'
  '*.log'
  'coverage'
  '.claude'
  '.context'
  'data'
  '.dev-data'
  'state_store.db'
  'stream_store'
  '.env'
  '.env.deploy.generated'
  '.env.deploy.existing'
  'docs/superpowers'
)

HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_INTERVAL=10

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DATA_DIR="${REMOTE_BACKUP_DIR}/data-${TIMESTAMP}"
BACKUP_APP_DIR="${REMOTE_BACKUP_DIR}/app-${TIMESTAMP}"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

TEST_DURATION=0
SYNC_COUNT=0

ENABLE_WHISPER=false
ENABLE_COSYVOICE=false

EXISTING_ENV_FILE=""

# ════════════════════════════════════════
# 工具函数
# ════════════════════════════════════════
log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }

remote_exec() {
  ssh "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

# TTY 版：用于需要实时进度的命令（如 docker build）。会注入控制字符，不用于解析输出。
remote_exec_tty() {
  ssh -t "${REMOTE_USER}@${REMOTE_HOST}" "$*"
}

prompt() {
  local message="$1"
  local default="${2:-}"
  local input
  if [ -n "${default}" ]; then
    read -rp "${message} [${default}]: " input
    echo "${input:-${default}}"
  else
    read -rp "${message}: " input
    echo "${input}"
  fi
}

# 静默输入：用于 API Key，不回显
prompt_secret() {
  local message="$1"
  local existing="${2:-}"
  local input
  if [ -n "${existing}" ]; then
    read -srp "${message}（已输入，回车保留原值）: " input
    echo "" >&2
    echo "${input:-${existing}}"
  else
    read -srp "${message}: " input
    echo "" >&2
    echo "${input}"
  fi
}

# 读取 env 文件中 key 的最后一个匹配值
env_get() {
  local file="$1" key="$2"
  [ -n "${file}" ] && [ -f "${file}" ] || return 0
  grep -E "^${key}=" "${file}" | tail -1 | cut -d= -f2-
}

prompt_yes_no() {
  local message="$1"
  local input
  read -rp "${message} [y/N]: " input
  [[ "${input}" =~ ^[Yy]$ ]]
}

# ════════════════════════════════════════
# 前置检查
# ════════════════════════════════════════
check_git_clean() {
  log_info "检查 git 工作区..."
  if ! git -C "${LOCAL_PROJECT_ROOT}" diff --quiet; then
    log_error "存在未提交的修改，请先提交或清理"
    exit 1
  fi
  if [ -n "$(git -C "${LOCAL_PROJECT_ROOT}" status --porcelain)" ]; then
    log_error "存在未跟踪的文件，请先处理"
    exit 1
  fi
  log_info "git 工作区干净"
}

check_ssh() {
  log_info "检查 SSH 连接 ${REMOTE_USER}@${REMOTE_HOST}..."
  if ! remote_exec "echo ok" >/dev/null 2>&1; then
    log_error "无法通过 SSH 连接到服务器（请确认密钥/网络）"
    exit 1
  fi
  log_info "SSH 连接正常"
}

ensure_remote_dirs() {
  log_info "确保服务器目录存在..."
  remote_exec "mkdir -p ${REMOTE_APP_DIR} ${REMOTE_DATA_DIR} ${REMOTE_BACKUP_DIR}"
}

# 交互式确认部署根目录，并按最终值重算派生路径
configure_remote_dir() {
  local input
  input=$(prompt "部署根目录（运行时数据/模型都放这里）" "${REMOTE_DIR_DEFAULT}")
  REMOTE_DIR="${input%/}"
  if [ -z "${REMOTE_DIR}" ]; then
    log_error "部署根目录不能为空"
    exit 1
  fi
  case "${REMOTE_DIR}" in
    /*) ;;
    *) log_error "部署根目录必须是绝对路径（以 / 开头）: ${REMOTE_DIR}"; exit 1 ;;
  esac
  REMOTE_APP_DIR="${REMOTE_DIR}/app"
  REMOTE_DATA_DIR="${REMOTE_DIR}/data"
  REMOTE_BACKUP_DIR="${REMOTE_DIR}/backups"
  REMOTE_ENV_FILE="${REMOTE_DATA_DIR}/.env"
  BACKUP_DATA_DIR="${REMOTE_BACKUP_DIR}/data-${TIMESTAMP}"
  BACKUP_APP_DIR="${REMOTE_BACKUP_DIR}/app-${TIMESTAMP}"
  log_info "部署根目录: ${REMOTE_DIR}"
  log_info "  代码:   ${REMOTE_APP_DIR}"
  log_info "  数据:   ${REMOTE_DATA_DIR}"
  log_info "  备份:   ${REMOTE_BACKUP_DIR}"
}

# 统一的远端 docker compose 调用：注入 AI_TUTOR_HOME、--env-file、叠加文件
dc() {
  remote_exec "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# TTY 版 dc：仅用于 up --build 等需要实时进度的命令
dc_tty() {
  remote_exec_tty "cd ${REMOTE_APP_DIR} && AI_TUTOR_HOME=${REMOTE_DIR} docker compose --env-file ${REMOTE_ENV_FILE} $(compose_files) $*"
}

# ════════════════════════════════════════
# 本地测试
# ════════════════════════════════════════
run_local_tests() {
  log_info "运行本地测试..."
  local start_time end_time
  start_time=$(date +%s)

  log_info "后端测试 (@ai-english-tutor/server)..."
  if ! (cd "${LOCAL_PROJECT_ROOT}" && pnpm --filter @ai-english-tutor/server test); then
    log_error "后端测试失败"
    exit 1
  fi

  log_info "前端测试 (tutor-app)..."
  if ! (cd "${LOCAL_PROJECT_ROOT}" && pnpm --filter tutor-app test); then
    log_error "前端测试失败"
    exit 1
  fi

  end_time=$(date +%s)
  TEST_DURATION=$((end_time - start_time))
  log_info "本地测试通过，耗时 ${TEST_DURATION}s"
}

# ════════════════════════════════════════
# 交互式 .env
# ════════════════════════════════════════
generate_env() {
  log_info "交互式配置服务器 .env (将写入 ${REMOTE_ENV_FILE})..."
  if [ -n "${EXISTING_ENV_FILE}" ]; then
    log_info "已读取现有 .env，下列默认值即当前服务器配置（直接回车保留）"
  else
    log_info "首次配置，默认值为项目内置推荐值"
  fi

  local llm_provider llm_api_key llm_base_url llm_model
  local deepseek_api_key deepseek_base_url deepseek_model
  local tts_provider tts_api_key tts_base_url tts_mode
  local asr_provider asr_api_key asr_base_url
  local cors_origin log_level heartbeat

  # ── 现有值（来自远端 .env；首次部署为空，下面用 :- 兜底到内置默认）──
  local prev_llm_provider prev_xiaomi_key prev_xiaomi_url prev_xiaomi_model
  local prev_deepseek_key prev_deepseek_url prev_deepseek_model
  local prev_tts_provider prev_tts_key prev_tts_url prev_tts_mode
  local prev_asr_provider prev_asr_key prev_asr_url
  local prev_cors prev_log prev_heartbeat prev_server_name
  prev_llm_provider=$(env_get "${EXISTING_ENV_FILE}" LLM_PROVIDER)
  prev_xiaomi_key=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_API_KEY)
  prev_xiaomi_url=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_BASE_URL)
  prev_xiaomi_model=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_MODEL)
  prev_deepseek_key=$(env_get "${EXISTING_ENV_FILE}" DEEPSEEK_API_KEY)
  prev_deepseek_url=$(env_get "${EXISTING_ENV_FILE}" DEEPSEEK_BASE_URL)
  prev_deepseek_model=$(env_get "${EXISTING_ENV_FILE}" DEEPSEEK_MODEL)
  prev_tts_provider=$(env_get "${EXISTING_ENV_FILE}" TTS_PROVIDER)
  prev_tts_key=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_TTS_API_KEY)
  prev_tts_url=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_TTS_BASE_URL)
  prev_tts_mode=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_TTS_MODE)
  prev_volcengine_tts_key=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_TTS_API_KEY)
  prev_volcengine_tts_resource_id=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_TTS_RESOURCE_ID)
  prev_volcengine_tts_speaker=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_TTS_SPEAKER)
  prev_volcengine_tts_format=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_TTS_FORMAT)
  prev_volcengine_tts_sample_rate=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_TTS_SAMPLE_RATE)
  prev_volcengine_asr_key=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_ASR_API_KEY)
  prev_volcengine_asr_resource_id=$(env_get "${EXISTING_ENV_FILE}" VOLCENGINE_ASR_RESOURCE_ID)
  prev_asr_provider=$(env_get "${EXISTING_ENV_FILE}" ASR_PROVIDER)
  prev_asr_key=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_ASR_API_KEY)
  prev_asr_url=$(env_get "${EXISTING_ENV_FILE}" XIAOMI_ASR_BASE_URL)
  prev_cors=$(env_get "${EXISTING_ENV_FILE}" CORS_ORIGIN)
  prev_log=$(env_get "${EXISTING_ENV_FILE}" LOG_LEVEL)
  prev_heartbeat=$(env_get "${EXISTING_ENV_FILE}" SSE_HEARTBEAT_INTERVAL)
  prev_server_name=$(env_get "${EXISTING_ENV_FILE}" SERVER_NAME)

  # 默认值（沿用现有值时不重置，写文件时按各分支赋值）
  llm_api_key=""; llm_base_url=""; llm_model=""
  deepseek_api_key=""; deepseek_base_url=""; deepseek_model=""
  tts_api_key=""; tts_base_url=""; tts_mode="${prev_tts_mode:-voicedesign}"
  asr_api_key=""; asr_base_url=""

  # ── LLM ──
  llm_provider=$(prompt "LLM 厂商 (xiaomi/deepseek/mock)" "${prev_llm_provider:-deepseek}")
  case "${llm_provider}" in
    xiaomi)
      llm_api_key=$(prompt_secret "Xiaomi LLM API Key (输入不回显)" "${prev_xiaomi_key}")
      llm_base_url=$(prompt "Xiaomi LLM Base URL" "${prev_xiaomi_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
      llm_model=$(prompt "Xiaomi LLM Model" "${prev_xiaomi_model:-mimo-v2.5}")
      ;;
    deepseek)
      deepseek_api_key=$(prompt_secret "DeepSeek API Key (输入不回显)" "${prev_deepseek_key}")
      deepseek_base_url=$(prompt "DeepSeek Base URL" "${prev_deepseek_url:-https://ark.cn-beijing.volces.com/api/v3}")
      deepseek_model=$(prompt "DeepSeek Model（火山方舟接入点 ID）" "${prev_deepseek_model}")
      ;;
    mock)
      ;;
    *)
      log_error "不支持的 LLM 厂商: ${llm_provider}"
      exit 1
      ;;
  esac

  # ── TTS ──（browser / xiaomi / cosyvoice / volcengine）
  tts_provider=$(prompt "TTS 厂商 (browser/xiaomi/cosyvoice/volcengine)" "${prev_tts_provider:-browser}")
  case "${tts_provider}" in
    browser)
      log_info "TTS=browser：前端走浏览器 SpeechSynthesis，后端不合成"
      ;;
    xiaomi)
      tts_api_key=$(prompt_secret "Xiaomi TTS API Key (输入不回显)" "${prev_tts_key}")
      tts_base_url=$(prompt "Xiaomi TTS Base URL" "${prev_tts_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
      tts_mode=$(prompt "Xiaomi TTS 模式 (voicedesign=按人设描述生成 / preset=固定预置音色)" "${prev_tts_mode:-voicedesign}")
      ;;
    cosyvoice)
      log_warn "CosyVoice 需 GPU，且需用 docker-compose.cosyvoice.yml 叠加部署"
      if prompt_yes_no "服务器是否已具备 GPU + cosyvoice:local 镜像"; then
        ENABLE_COSYVOICE=true
        log_warn "将以 -f docker-compose.cosyvoice.yml 叠加启动 cosyvoice"
      else
        log_warn "未启用 GPU，TTS 自动切换为 browser"
        tts_provider="browser"
      fi
      ;;
    volcengine)
      local volcengine_tts_key volcengine_tts_resource_id volcengine_tts_speaker volcengine_tts_format volcengine_tts_sample_rate
      volcengine_tts_key=$(prompt_secret "Volcengine TTS API Key (输入不回显)" "${prev_volcengine_tts_key}")
      volcengine_tts_resource_id=$(prompt "Volcengine TTS Resource ID" "${prev_volcengine_tts_resource_id:-seed-tts-2.0}")
      volcengine_tts_speaker=$(prompt "Volcengine TTS Speaker" "${prev_volcengine_tts_speaker:-zh_female_gaolengyujie_uranus_bigtts}")
      volcengine_tts_format=$(prompt "Volcengine TTS Format" "${prev_volcengine_tts_format:-mp3}")
      volcengine_tts_sample_rate=$(prompt "Volcengine TTS Sample Rate" "${prev_volcengine_tts_sample_rate:-24000}")
      VOLCENGINE_TTS_API_KEY="${volcengine_tts_key}"
      VOLCENGINE_TTS_RESOURCE_ID="${volcengine_tts_resource_id}"
      VOLCENGINE_TTS_SPEAKER="${volcengine_tts_speaker}"
      VOLCENGINE_TTS_FORMAT="${volcengine_tts_format}"
      VOLCENGINE_TTS_SAMPLE_RATE="${volcengine_tts_sample_rate}"
      ;;
    *)
      log_error "不支持的 TTS 厂商: ${tts_provider}"
      exit 1
      ;;
  esac

  # ── ASR ──（browser / xiaomi / whisper / volcengine）
  asr_provider=$(prompt "ASR 厂商 (browser/xiaomi/whisper/volcengine)" "${prev_asr_provider:-browser}")
  case "${asr_provider}" in
    browser)
      log_info "ASR=browser：前端浏览器识别，无需 whisper 容器"
      ;;
    xiaomi)
      asr_api_key=$(prompt_secret "Xiaomi ASR API Key (输入不回显)" "${prev_asr_key}")
      asr_base_url=$(prompt "Xiaomi ASR Base URL" "${prev_asr_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
      ;;
    whisper)
      asr_base_url="http://whisper:8080"
      ENABLE_WHISPER=true
      log_warn "ASR=whisper：将以 -f docker-compose.whisper.yml 叠加启动 whisper.cpp 容器"
      ;;
    volcengine)
      local volcengine_asr_key volcengine_asr_resource_id
      volcengine_asr_key=$(prompt_secret "Volcengine ASR API Key（留空则回退到 TTS key，输入不回显）" "${prev_volcengine_asr_key}")
      volcengine_asr_resource_id=$(prompt "Volcengine ASR Resource ID" "${prev_volcengine_asr_resource_id:-volc.seedasr.sauc.duration}")
      VOLCENGINE_ASR_API_KEY="${volcengine_asr_key}"
      VOLCENGINE_ASR_RESOURCE_ID="${volcengine_asr_resource_id}"
      ;;
    *)
      log_error "不支持的 ASR 厂商: ${asr_provider}"
      exit 1
      ;;
  esac

  # ── 通用 ──
  cors_origin=$(prompt "CORS_ORIGIN" "${prev_cors:-*}")
  log_level=$(prompt "LOG_LEVEL" "${prev_log:-info}")
  heartbeat=$(prompt "SSE_HEARTBEAT_INTERVAL" "${prev_heartbeat:-30000}")
  # SERVER_NAME：nginx http(s) server_name；HTTPS 启用时建议填 FQDN/IP，纯 HTTP 可留空用 _
  server_name=$(prompt "SERVER_NAME（HTTPS 虚拟主机；留空 = _）" "${prev_server_name}")

  cat > "${LOCAL_ENV_TEMP}" <<EOF
# Generated by deploy-to-server.sh at ${TIMESTAMP}
PORT=3000
NODE_ENV=production
LOG_LEVEL=${log_level}
CORS_ORIGIN=${cors_origin}
SSE_HEARTBEAT_INTERVAL=${heartbeat}
# HTTPS 虚拟主机（nginx server_name）；留空 = _ 匹配所有
SERVER_NAME=${server_name}

# ── 前端（Vite，构建期注入；compose --env-file 读取后传给 frontend build args）──
VITE_BACKEND_URL=
VITE_CHARACTER_PROVIDER=live2d

# ── LLM ──
LLM_PROVIDER=${llm_provider}
XIAOMI_API_KEY=${llm_api_key}
XIAOMI_BASE_URL=${llm_base_url}
XIAOMI_MODEL=${llm_model}
DEEPSEEK_API_KEY=${deepseek_api_key}
DEEPSEEK_BASE_URL=${deepseek_base_url}
DEEPSEEK_MODEL=${deepseek_model}

# ── TTS ──（browser / xiaomi / cosyvoice / volcengine）
TTS_PROVIDER=${tts_provider}
XIAOMI_TTS_API_KEY=${tts_api_key}
XIAOMI_TTS_BASE_URL=${tts_base_url}
# XIAOMI_TTS_MODE：voicedesign=按人设描述生成；preset=固定预置音色
XIAOMI_TTS_MODE=${tts_mode}
# voicedesign 英文兜底音色描述
XIAOMI_TTS_VOICE_DESIGN=成熟知性的御姐，声线低沉磁性、略带沙哑，慵懒从容，语速偏慢，句尾带轻气声
# 中文翻译音色
# XIAOMI_TTS_ZH_VOICE_DESIGN=台湾腔温柔女声，语速适中，声音甜美温暖
# 通用 TTS 参数（按需开启）
# TTS_FORMAT=mp3
# TTS_SPEED=1.0
# CosyVoice（需 GPU + docker-compose.cosyvoice.yml 叠加）
COSYVOICE_BASE_URL=http://cosyvoice:50000
COSYVOICE_SPK_ID=英文女
COSYVOICE_SPEED=0.9

# Volcengine 火山方舟 Agent Plan 语音合成 TTS
VOLCENGINE_TTS_API_KEY=${VOLCENGINE_TTS_API_KEY:-}
VOLCENGINE_TTS_RESOURCE_ID=${VOLCENGINE_TTS_RESOURCE_ID:-seed-tts-2.0}
# VOLCENGINE_TTS_BASE_URL=https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional
# VOLCENGINE_TTS_SPEAKER=zh_female_gaolengyujie_uranus_bigtts
# VOLCENGINE_TTS_FORMAT=mp3
# VOLCENGINE_TTS_SAMPLE_RATE=24000

# Volcengine 火山方舟 Agent Plan 语音识别 ASR
VOLCENGINE_ASR_API_KEY=${VOLCENGINE_ASR_API_KEY:-}
VOLCENGINE_ASR_RESOURCE_ID=${VOLCENGINE_ASR_RESOURCE_ID:-volc.seedasr.sauc.duration}
# VOLCENGINE_ASR_BASE_URL=wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream
# VOLCENGINE_ASR_SEGMENT_MS=200

# ── ASR ──（browser=浏览器识别 / xiaomi / whisper）
ASR_PROVIDER=${asr_provider}
XIAOMI_ASR_API_KEY=${asr_api_key}
XIAOMI_ASR_BASE_URL=${asr_base_url}
# XIAOMI_ASR_MODEL=mimo-v2.5-asr
# 通用 ASR 参数（按需开启）
# ASR_LANGUAGE=auto
# MAX_AUDIO_SIZE_MB=10
# Whisper（需 docker-compose.whisper.yml 叠加）
WHISPER_BASE_URL=http://whisper:8080
WHISPER_MODEL=${WHISPER_MODEL_FILE}

# ── Data ──
DB_PATH=/app/data/tutor.db
CONFIG_DIR=/app/data
DATA_DIR=/app/data
TTS_CACHE_DIR=/app/data/tts-cache
EOF

  log_info "已生成本地临时 .env，准备上传"
}

configure_remote_env() {
  if remote_exec "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_info "服务器已存在 ${REMOTE_ENV_FILE}"
    # 拉取远端 .env 到本地，作为本次交互式配置的默认值来源
    EXISTING_ENV_FILE="${LOCAL_PROJECT_ROOT}/.env.deploy.existing"
    if ! scp "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}" "${EXISTING_ENV_FILE}" >/dev/null 2>&1; then
      log_warn "拉取远端 .env 失败，将以内置默认值进行交互"
      EXISTING_ENV_FILE=""
    fi
    local reconfigure=false
    if remote_exec "grep -qE 'your-.*-api-key|^XIAOMI_API_KEY=$|^XIAOMI_TTS_API_KEY=$|^VOLCENGINE_TTS_API_KEY=$' ${REMOTE_ENV_FILE}"; then
      log_warn "检测到 .env 中存在占位符或空 API Key"
      if prompt_yes_no "是否重新交互式配置（默认值=现有配置，API Key 回车保留）"; then
        reconfigure=true
      fi
    else
      if prompt_yes_no "是否重新交互式配置 .env（默认值=现有配置，回车逐项保留；N=原样沿用）"; then
        reconfigure=true
      fi
    fi
    if $reconfigure; then
      generate_env
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    fi
    [ -n "${EXISTING_ENV_FILE}" ] && rm -f "${EXISTING_ENV_FILE}"
    EXISTING_ENV_FILE=""
  else
    log_warn "服务器不存在 ${REMOTE_ENV_FILE}"
    if prompt_yes_no "是否交互式创建 .env"; then
      generate_env
      scp "${LOCAL_ENV_TEMP}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}"
    else
      log_warn "跳过 .env 配置，将由 init-host-dir.sh 从模板复制（含占位符，需手动编辑）"
    fi
  fi
  rm -f "${LOCAL_ENV_TEMP}"
}

# ════════════════════════════════════════
# 备份 / 同步 / 初始化 data/
# ════════════════════════════════════════
backup_remote() {
  log_info "备份服务器数据..."
  remote_exec "mkdir -p ${BACKUP_DATA_DIR} ${BACKUP_APP_DIR}"
  # 排除 whisper/cosyvoice 模型目录（可重新下载）
  remote_exec "if [ -d ${REMOTE_DATA_DIR} ]; then find ${REMOTE_DATA_DIR} -mindepth 1 -maxdepth 1 ! -name whisper-models ! -name cosyvoice-models -exec cp -a {} ${BACKUP_DATA_DIR}/ \\; 2>/dev/null || true; fi"
  remote_exec "if [ -d ${REMOTE_APP_DIR} ]; then cp -a ${REMOTE_APP_DIR}/. ${BACKUP_APP_DIR}/ 2>/dev/null || true; fi"
  log_info "数据备份: ${BACKUP_DATA_DIR}"
  log_info "代码备份: ${BACKUP_APP_DIR}"
}

sync_code() {
  log_info "同步代码到服务器..."
  local exclude_args=()
  for item in "${RSYNC_EXCLUDES[@]}"; do
    exclude_args+=("--exclude=${item}")
  done

  local rsync_log
  rsync_log=$(mktemp)
  rsync -avz --delete --itemize-changes \
    ${exclude_args[@]+"${exclude_args[@]}"} \
    "${LOCAL_PROJECT_ROOT}/" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/" | tee "${rsync_log}"

  SYNC_COUNT=$(grep -cE '^[<>][fcdLDS]' "${rsync_log}" 2>/dev/null || true)
  SYNC_COUNT=${SYNC_COUNT:-0}
  rm -f "${rsync_log}"
  log_info "rsync 完成，共变更 ${SYNC_COUNT} 个文件/目录"
}

init_remote_data_dir() {
  log_info "在服务器初始化 data/ 目录..."
  remote_exec "bash ${REMOTE_APP_DIR}/scripts/init-host-dir.sh ${REMOTE_DIR}"
}

# 上传本地 mkcert 自签证书到远端。rsync 排除 data/，所以证书必须显式 scp。
sync_certs() {
  local local_cert="${LOCAL_PROJECT_ROOT}/data/certs/fullchain.pem"
  local local_key="${LOCAL_PROJECT_ROOT}/data/certs/privkey.pem"
  if [ ! -f "$local_cert" ] || [ ! -f "$local_key" ]; then
    log_warn "本地未发现 ${local_cert} / ${local_key}，跳过 HTTPS 部署"
    log_warn "  如需 HTTPS：先在本机跑 'bash scripts/init-host-dir.sh' 生成 mkcert 证书，再重跑部署"
    return 0
  fi
  log_info "上传 mkcert 证书到 ${REMOTE_DATA_DIR}/certs/ ..."
  remote_exec "mkdir -p ${REMOTE_DATA_DIR}/certs"
  scp "$local_cert" "$local_key" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DATA_DIR}/certs/"
  log_info "证书已上传，gateway 将自动启用 HTTPS (443)"
}

# ════════════════════════════════════════
# Compose 叠加文件探测
# ════════════════════════════════════════
# 依据远端 .env 的 ASR_PROVIDER / TTS_PROVIDER 推断需要哪些叠加 compose 文件。
detect_compose_overlays() {
  if ! remote_exec "[ -f ${REMOTE_ENV_FILE} ]"; then
    log_warn "远端无 .env，按仅主 compose 部署"
    return 0
  fi
  local asr tts
  asr=$(remote_exec "grep -E '^ASR_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
  tts=$(remote_exec "grep -E '^TTS_PROVIDER=' ${REMOTE_ENV_FILE} | tail -1 | cut -d= -f2 | tr -d '[:space:]'" || true)
  [ "${asr}" = "whisper" ] && ENABLE_WHISPER=true
  [ "${tts}" = "cosyvoice" ] && ENABLE_COSYVOICE=true
  log_info "compose 叠加：ASR=${asr:-?}(whisper=${ENABLE_WHISPER}) / TTS=${tts:-?}(cosyvoice=${ENABLE_COSYVOICE})"
}

# 组装 docker compose 的 -f 参数（主 compose + 按需叠加）
compose_files() {
  local files="-f docker-compose.yml"
  $ENABLE_WHISPER   && files="${files} -f docker-compose.whisper.yml"
  $ENABLE_COSYVOICE && files="${files} -f docker-compose.cosyvoice.yml"
  echo "${files}"
}

# ════════════════════════════════════════
# Whisper 模型引导
# ════════════════════════════════════════
ensure_whisper_model() {
  if ! $ENABLE_WHISPER; then
    log_info "ASR 非 whisper，跳过 whisper 模型引导"
    return 0
  fi
  local model_dir="${REMOTE_DATA_DIR}/whisper-models"
  local model_path="${model_dir}/${WHISPER_MODEL_FILE}"
  log_info "检查 whisper 模型 (${model_path})..."
  remote_exec "mkdir -p ${model_dir}"
  if remote_exec "[ -f ${model_path} ]" >/dev/null 2>&1; then
    log_info "whisper 模型已存在，跳过下载"
    return 0
  fi
  log_warn "whisper 模型缺失，开始下载（~150MB，首次较慢）..."
  if ! remote_exec "docker run --rm -v ${model_dir}:/models alpine sh -c 'apk add --no-cache curl >/dev/null && curl -fL --retry 3 -o /models/${WHISPER_MODEL_FILE} ${WHISPER_MODEL_URL}'"; then
    log_error "whisper 模型下载失败"
    cat >&2 <<HINT

${YELLOW}[手动重试]${NC} 国内访问 HuggingFace 可能不稳定。可选方案（模型目录: ${model_dir}）：

  ${GREEN}# 方案 1：直接重试 HuggingFace（多用 --retry，可能需要科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \\
    "docker run --rm -v ${model_dir}:/models alpine sh -c \\
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
         ${WHISPER_MODEL_URL}'"

  ${GREEN}# 方案 2：换 hf-mirror.com（国内镜像，无需科学上网）${NC}
  ssh ${REMOTE_USER}@${REMOTE_HOST} \\
    "docker run --rm -v ${model_dir}:/models alpine sh -c \\
      'apk add --no-cache curl >/dev/null && \\
       curl -fL --retry 5 -o /models/${WHISPER_MODEL_FILE} \\
         https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}'"

  ${GREEN}# 方案 3：本地下载后 scp 上传（最可靠）${NC}
  curl -fL -O ${WHISPER_MODEL_URL}
  scp ${WHISPER_MODEL_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${model_dir}/

模型就绪后重新运行 ${GREEN}./scripts/deploy-to-server.sh${NC} 即可。
HINT
    exit 1
  fi
  log_info "whisper 模型下载完成"
}

# ════════════════════════════════════════
# Docker 启动 / 健康检查 / 回滚
# ════════════════════════════════════════
deploy_services() {
  log_info "在服务器上构建并启动服务..."
  log_info "compose 文件: $(compose_files)"
  dc down
  # 用 TTY 版执行 up --build，让 BuildKit 进度实时可见
  dc_tty "up --build -d"
  log_info "服务已启动（后台），等待健康检查"
}

check_health() {
  local attempt=1
  local healthy_count
  while [ ${attempt} -le ${HEALTH_CHECK_RETRIES} ]; do
    log_info "健康检查 ${attempt}/${HEALTH_CHECK_RETRIES}..."
    healthy_count=$(dc "ps --format json backend gateway 2>/dev/null | grep -c '\"Health\":\"healthy\"' || true")
    healthy_count=${healthy_count:-0}
    if [ "${healthy_count}" -ge 2 ]; then
      log_info "backend 和 gateway 均健康"
      return 0
    fi
    log_warn "当前健康容器: ${healthy_count}/2"
    if [ ${attempt} -lt ${HEALTH_CHECK_RETRIES} ]; then
      sleep ${HEALTH_CHECK_INTERVAL}
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

rollback() {
  log_error "健康检查连续 ${HEALTH_CHECK_RETRIES} 次失败，开始回滚到 ${BACKUP_APP_DIR}..."
  dc down
  remote_exec "find ${REMOTE_APP_DIR} -mindepth 1 -delete && cp -a ${BACKUP_APP_DIR}/. ${REMOTE_APP_DIR}/"
  dc "up -d"

  if check_health; then
    log_info "回滚成功，服务已恢复到上一个版本"
  else
    log_error "回滚后服务仍不健康，请手动 ssh 检查 docker compose logs"
    exit 1
  fi
}

# ════════════════════════════════════════
# 报告 / Main
# ════════════════════════════════════════
print_report() {
  local status="$1"
  local test_duration="$2"
  local sync_count="$3"
  local deploy_duration="$4"

  echo ""
  echo "================ 部署报告 ================"
  echo "本地测试：          通过 (${test_duration}s)"
  echo "服务器：            ${REMOTE_USER}@${REMOTE_HOST}"
  echo "数据备份：          ${BACKUP_DATA_DIR}"
  echo "代码备份：          ${BACKUP_APP_DIR}"
  echo "代码变更文件数：    ${sync_count}"
  echo "部署耗时：          ${deploy_duration}s"
  echo "容器状态："
  dc "ps --format 'table {{.Name}}\t{{.Status}}'" || true
  echo "结果：              ${status}"
  echo "=========================================="
}

main() {
  local start_time deploy_duration

  check_git_clean
  check_ssh
  configure_remote_dir
  ensure_remote_dirs

  run_local_tests

  configure_remote_env
  backup_remote

  start_time=$(date +%s)
  sync_code
  init_remote_data_dir
  sync_certs
  detect_compose_overlays
  ensure_whisper_model
  deploy_services

  if check_health; then
    deploy_duration=$(($(date +%s) - start_time))
    print_report "成功" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 0
  else
    rollback
    deploy_duration=$(($(date +%s) - start_time))
    print_report "失败并已回滚" "${TEST_DURATION}" "${SYNC_COUNT}" "${deploy_duration}"
    exit 1
  fi
}

main "$@"
