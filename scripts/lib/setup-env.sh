# AI English Tutor — 交互式 .env 配置公共库
# 被 scripts/setup.sh 和 scripts/deploy-to-server.sh source 使用。
# 本文件只包含纯配置生成逻辑，不涉及 SSH、rsync、备份等远端操作。

# ── 颜色输出 ──
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

log_info()  { echo "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo "${RED}[ERROR]${NC} $*" >&2; }

# ── 交互式 prompt 工具 ──
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

prompt_yes_no() {
  local message="$1"
  local input
  read -rp "${message} [y/N]: " input
  [[ "${input}" =~ ^[Yy]$ ]]
}

# 读取 env 文件中 key 的最后一个匹配值
env_get() {
  local file="$1" key="$2"
  [ -n "${file}" ] && [ -f "${file}" ] || return 0
  grep -E "^${key}=" "${file}" | tail -1 | cut -d= -f2-
}

# ── 核心：交互式/非交互式生成 .env ──
# 用法：generate_env <output_file> [existing_file] [noninteractive]
#   output_file:    要写入的 .env 路径
#   existing_file:  作为默认值来源的已有 .env（可选）
#   noninteractive: 为 true 时直接读取环境变量/默认值，不 prompt
# 副作用：设置全局变量 GENERATED_ENABLE_WHISPER / GENERATED_ENABLE_COSYVOICE
# 注意：bash 3 兼容，不要使用 local -n / associative array / [[ -v ]]
generate_env() {
  local output_file="$1"
  local existing_file="${2:-}"
  local noninteractive="${3:-false}"

  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)

  # ── 从已有文件读取默认值 ──
  local prev_llm_provider prev_deepseek_key prev_deepseek_url prev_deepseek_model
  local prev_xiaomi_key prev_xiaomi_url prev_xiaomi_model
  local prev_volcengine_llm_key prev_volcengine_llm_url prev_volcengine_llm_model
  local prev_tts_provider prev_tts_key prev_tts_url prev_tts_mode
  local prev_volcengine_tts_key prev_volcengine_tts_resource_id prev_volcengine_tts_speaker
  local prev_volcengine_tts_format prev_volcengine_tts_sample_rate
  local prev_asr_provider prev_asr_key prev_asr_url
  local prev_volcengine_asr_key prev_volcengine_asr_resource_id
  local prev_cors prev_log prev_heartbeat prev_server_name

  prev_llm_provider=$(env_get "${existing_file}" LLM_PROVIDER)
  prev_deepseek_key=$(env_get "${existing_file}" DEEPSEEK_API_KEY)
  prev_deepseek_url=$(env_get "${existing_file}" DEEPSEEK_BASE_URL)
  prev_deepseek_model=$(env_get "${existing_file}" DEEPSEEK_MODEL)
  prev_xiaomi_key=$(env_get "${existing_file}" XIAOMI_API_KEY)
  prev_xiaomi_url=$(env_get "${existing_file}" XIAOMI_BASE_URL)
  prev_xiaomi_model=$(env_get "${existing_file}" XIAOMI_MODEL)
  prev_volcengine_llm_key=$(env_get "${existing_file}" VOLCENGINE_LLM_API_KEY)
  prev_volcengine_llm_url=$(env_get "${existing_file}" VOLCENGINE_LLM_BASE_URL)
  prev_volcengine_llm_model=$(env_get "${existing_file}" VOLCENGINE_LLM_MODEL)
  prev_tts_provider=$(env_get "${existing_file}" TTS_PROVIDER)
  prev_tts_key=$(env_get "${existing_file}" XIAOMI_TTS_API_KEY)
  prev_tts_url=$(env_get "${existing_file}" XIAOMI_TTS_BASE_URL)
  prev_tts_mode=$(env_get "${existing_file}" XIAOMI_TTS_MODE)
  prev_volcengine_tts_key=$(env_get "${existing_file}" VOLCENGINE_TTS_API_KEY)
  prev_volcengine_tts_resource_id=$(env_get "${existing_file}" VOLCENGINE_TTS_RESOURCE_ID)
  prev_volcengine_tts_speaker=$(env_get "${existing_file}" VOLCENGINE_TTS_SPEAKER)
  prev_volcengine_tts_format=$(env_get "${existing_file}" VOLCENGINE_TTS_FORMAT)
  prev_volcengine_tts_sample_rate=$(env_get "${existing_file}" VOLCENGINE_TTS_SAMPLE_RATE)
  prev_asr_provider=$(env_get "${existing_file}" ASR_PROVIDER)
  prev_asr_key=$(env_get "${existing_file}" XIAOMI_ASR_API_KEY)
  prev_asr_url=$(env_get "${existing_file}" XIAOMI_ASR_BASE_URL)
  prev_volcengine_asr_key=$(env_get "${existing_file}" VOLCENGINE_ASR_API_KEY)
  prev_volcengine_asr_resource_id=$(env_get "${existing_file}" VOLCENGINE_ASR_RESOURCE_ID)
  prev_cors=$(env_get "${existing_file}" CORS_ORIGIN)
  prev_log=$(env_get "${existing_file}" LOG_LEVEL)
  prev_heartbeat=$(env_get "${existing_file}" SSE_HEARTBEAT_INTERVAL)
  prev_server_name=$(env_get "${existing_file}" SERVER_NAME)

  # ── 收集配置 ──
  local llm_provider llm_api_key llm_base_url llm_model
  local deepseek_api_key deepseek_base_url deepseek_model
  local xiaomi_api_key xiaomi_base_url xiaomi_model
  local volcengine_llm_api_key volcengine_llm_base_url volcengine_llm_model
  local tts_provider tts_api_key tts_base_url tts_mode
  local volcengine_tts_api_key volcengine_tts_resource_id volcengine_tts_speaker
  local volcengine_tts_format volcengine_tts_sample_rate
  local asr_provider asr_api_key asr_base_url
  local volcengine_asr_api_key volcengine_asr_resource_id
  local cors_origin log_level heartbeat server_name

  # 默认值（全部显式初始化，避免在 set -u 环境下出现 unbound variable）
  llm_api_key=""; llm_base_url=""; llm_model=""
  deepseek_api_key=""; deepseek_base_url=""; deepseek_model=""
  xiaomi_api_key=""; xiaomi_base_url=""; xiaomi_model=""
  volcengine_llm_api_key=""; volcengine_llm_base_url=""; volcengine_llm_model=""
  tts_api_key=""; tts_base_url=""; tts_mode="${prev_tts_mode:-voicedesign}"
  volcengine_tts_api_key=""; volcengine_tts_resource_id=""
  volcengine_tts_speaker=""; volcengine_tts_format=""; volcengine_tts_sample_rate=""
  asr_api_key=""; asr_base_url=""
  volcengine_asr_api_key=""; volcengine_asr_resource_id=""

  GENERATED_ENABLE_WHISPER=false
  GENERATED_ENABLE_COSYVOICE=false

  # ── LLM ──
  if $noninteractive; then
    llm_provider="${LLM_PROVIDER:-${prev_llm_provider:-volcengine}}"
  else
    llm_provider=$(prompt "LLM 厂商 (volcengine/deepseek/xiaomi/mock)" "${prev_llm_provider:-volcengine}")
  fi

  case "${llm_provider}" in
    volcengine)
      if $noninteractive; then
        volcengine_llm_api_key="${VOLCENGINE_LLM_API_KEY:-${prev_volcengine_llm_key:-}}"
        volcengine_llm_base_url="${VOLCENGINE_LLM_BASE_URL:-${prev_volcengine_llm_url:-https://ark.cn-beijing.volces.com/api/v3}}"
        volcengine_llm_model="${VOLCENGINE_LLM_MODEL:-${prev_volcengine_llm_model:-}}"
      else
        volcengine_llm_api_key=$(prompt_secret "Volcengine LLM API Key（火山方舟，输入不回显）" "${prev_volcengine_llm_key}")
        volcengine_llm_base_url=$(prompt "Volcengine LLM Base URL" "${prev_volcengine_llm_url:-https://ark.cn-beijing.volces.com/api/v3}")
        volcengine_llm_model=$(prompt "Volcengine LLM Model（推理接入点 ID，如 ep-xxxxxxxxxxxxx）" "${prev_volcengine_llm_model}")
      fi
      if [ -z "${volcengine_llm_api_key}" ]; then
        log_warn "Volcengine LLM API Key 为空，后端初始化可能失败"
      fi
      if [ -z "${volcengine_llm_model}" ]; then
        log_warn "Volcengine LLM Model（接入点 ID）为空，后端初始化可能失败"
      fi
      ;;
    deepseek)
      if $noninteractive; then
        deepseek_api_key="${DEEPSEEK_API_KEY:-${prev_deepseek_key:-}}"
        deepseek_base_url="${DEEPSEEK_BASE_URL:-${prev_deepseek_url:-https://api.deepseek.com}}"
        deepseek_model="${DEEPSEEK_MODEL:-${prev_deepseek_model:-deepseek-chat}}"
      else
        deepseek_api_key=$(prompt_secret "DeepSeek API Key（输入不回显）" "${prev_deepseek_key}")
        deepseek_base_url=$(prompt "DeepSeek Base URL" "${prev_deepseek_url:-https://api.deepseek.com}")
        deepseek_model=$(prompt "DeepSeek Model" "${prev_deepseek_model:-deepseek-chat}")
      fi
      ;;
    xiaomi)
      if $noninteractive; then
        xiaomi_api_key="${XIAOMI_API_KEY:-${prev_xiaomi_key:-}}"
        xiaomi_base_url="${XIAOMI_BASE_URL:-${prev_xiaomi_url:-https://token-plan-sgp.xiaomimimo.com/v1}}"
        xiaomi_model="${XIAOMI_MODEL:-${prev_xiaomi_model:-mimo-v2.5}}"
      else
        xiaomi_api_key=$(prompt_secret "Xiaomi LLM API Key（输入不回显）" "${prev_xiaomi_key}")
        xiaomi_base_url=$(prompt "Xiaomi LLM Base URL" "${prev_xiaomi_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
        xiaomi_model=$(prompt "Xiaomi LLM Model" "${prev_xiaomi_model:-mimo-v2.5}")
      fi
      ;;
    mock)
      ;;
    *)
      log_error "不支持的 LLM 厂商: ${llm_provider}"
      return 1
      ;;
  esac

  # ── TTS ──
  if $noninteractive; then
    tts_provider="${TTS_PROVIDER:-${prev_tts_provider:-browser}}"
  else
    tts_provider=$(prompt "TTS 厂商 (browser/volcengine/xiaomi/cosyvoice)" "${prev_tts_provider:-browser}")
  fi

  case "${tts_provider}" in
    browser)
      log_info "TTS=browser：前端走浏览器 SpeechSynthesis，后端不合成"
      ;;
    xiaomi)
      if $noninteractive; then
        tts_api_key="${XIAOMI_TTS_API_KEY:-${prev_tts_key:-}}"
        tts_base_url="${XIAOMI_TTS_BASE_URL:-${prev_tts_url:-https://token-plan-sgp.xiaomimimo.com/v1}}"
        tts_mode="${XIAOMI_TTS_MODE:-${prev_tts_mode:-voicedesign}}"
      else
        tts_api_key=$(prompt_secret "Xiaomi TTS API Key（输入不回显）" "${prev_tts_key}")
        tts_base_url=$(prompt "Xiaomi TTS Base URL" "${prev_tts_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
        tts_mode=$(prompt "Xiaomi TTS 模式 (voicedesign=按人设描述生成 / preset=固定预置音色)" "${prev_tts_mode:-voicedesign}")
      fi
      ;;
    cosyvoice)
      if $noninteractive; then
        GENERATED_ENABLE_COSYVOICE=true
        log_warn "TTS=cosyvoice：非交互模式下自动启用 cosyvoice 叠加，请确认服务器具备 GPU"
      else
        log_warn "CosyVoice 需 GPU，且需用 docker-compose.cosyvoice.yml 叠加部署"
        if prompt_yes_no "服务器是否已具备 GPU + cosyvoice:local 镜像"; then
          GENERATED_ENABLE_COSYVOICE=true
          log_warn "将以 -f docker-compose.cosyvoice.yml 叠加启动 cosyvoice"
        else
          log_warn "未启用 GPU，TTS 自动切换为 browser"
          tts_provider="browser"
        fi
      fi
      ;;
    volcengine)
      if $noninteractive; then
        volcengine_tts_api_key="${VOLCENGINE_TTS_API_KEY:-${prev_volcengine_tts_key:-}}"
        volcengine_tts_resource_id="${VOLCENGINE_TTS_RESOURCE_ID:-${prev_volcengine_tts_resource_id:-seed-tts-2.0}}"
        volcengine_tts_speaker="${VOLCENGINE_TTS_SPEAKER:-${prev_volcengine_tts_speaker:-zh_female_gaolengyujie_uranus_bigtts}}"
        volcengine_tts_format="${VOLCENGINE_TTS_FORMAT:-${prev_volcengine_tts_format:-mp3}}"
        volcengine_tts_sample_rate="${VOLCENGINE_TTS_SAMPLE_RATE:-${prev_volcengine_tts_sample_rate:-24000}}"
      else
        volcengine_tts_api_key=$(prompt_secret "Volcengine TTS API Key（输入不回显）" "${prev_volcengine_tts_key}")
        volcengine_tts_resource_id=$(prompt "Volcengine TTS Resource ID" "${prev_volcengine_tts_resource_id:-seed-tts-2.0}")
        volcengine_tts_speaker=$(prompt "Volcengine TTS Speaker" "${prev_volcengine_tts_speaker:-zh_female_gaolengyujie_uranus_bigtts}")
        volcengine_tts_format=$(prompt "Volcengine TTS Format" "${prev_volcengine_tts_format:-mp3}")
        volcengine_tts_sample_rate=$(prompt "Volcengine TTS Sample Rate" "${prev_volcengine_tts_sample_rate:-24000}")
      fi
      if [ -z "${volcengine_tts_api_key}" ]; then
        log_warn "Volcengine TTS API Key 为空，后端初始化可能失败"
      fi
      ;;
    *)
      log_error "不支持的 TTS 厂商: ${tts_provider}"
      return 1
      ;;
  esac

  # ── ASR ──
  if $noninteractive; then
    asr_provider="${ASR_PROVIDER:-${prev_asr_provider:-browser}}"
  else
    asr_provider=$(prompt "ASR 厂商 (browser/volcengine/whisper/xiaomi)" "${prev_asr_provider:-browser}")
  fi

  case "${asr_provider}" in
    browser)
      log_info "ASR=browser：前端浏览器识别，无需 whisper 容器"
      ;;
    xiaomi)
      if $noninteractive; then
        asr_api_key="${XIAOMI_ASR_API_KEY:-${prev_asr_key:-}}"
        asr_base_url="${XIAOMI_ASR_BASE_URL:-${prev_asr_url:-https://token-plan-sgp.xiaomimimo.com/v1}}"
      else
        asr_api_key=$(prompt_secret "Xiaomi ASR API Key（输入不回显）" "${prev_asr_key}")
        asr_base_url=$(prompt "Xiaomi ASR Base URL" "${prev_asr_url:-https://token-plan-sgp.xiaomimimo.com/v1}")
      fi
      ;;
    whisper)
      GENERATED_ENABLE_WHISPER=true
      if $noninteractive; then
        log_warn "ASR=whisper：将以 -f docker-compose.whisper.yml 叠加启动 whisper.cpp 容器"
      else
        log_warn "ASR=whisper：将以 -f docker-compose.whisper.yml 叠加启动 whisper.cpp 容器"
      fi
      ;;
    volcengine)
      if $noninteractive; then
        volcengine_asr_api_key="${VOLCENGINE_ASR_API_KEY:-${prev_volcengine_asr_key:-}}"
        volcengine_asr_resource_id="${VOLCENGINE_ASR_RESOURCE_ID:-${prev_volcengine_asr_resource_id:-volc.seedasr.sauc.duration}}"
      else
        volcengine_asr_api_key=$(prompt_secret "Volcengine ASR API Key（留空则回退到 TTS key，输入不回显）" "${prev_volcengine_asr_key}")
        volcengine_asr_resource_id=$(prompt "Volcengine ASR Resource ID" "${prev_volcengine_asr_resource_id:-volc.seedasr.sauc.duration}")
      fi
      ;;
    *)
      log_error "不支持的 ASR 厂商: ${asr_provider}"
      return 1
      ;;
  esac

  # ── 通用 ──
  if $noninteractive; then
    cors_origin="${CORS_ORIGIN:-${prev_cors:-*}}"
    log_level="${LOG_LEVEL:-${prev_log:-info}}"
    heartbeat="${SSE_HEARTBEAT_INTERVAL:-${prev_heartbeat:-30000}}"
    server_name="${SERVER_NAME:-${prev_server_name:-}}"
  else
    cors_origin=$(prompt "CORS_ORIGIN" "${prev_cors:-*}")
    log_level=$(prompt "LOG_LEVEL" "${prev_log:-info}")
    heartbeat=$(prompt "SSE_HEARTBEAT_INTERVAL" "${prev_heartbeat:-30000}")
    server_name=$(prompt "SERVER_NAME（HTTPS 虚拟主机；留空 = _）" "${prev_server_name}")
  fi

  # ── 写入 .env ──
  cat > "${output_file}" <<EOF
# Generated by AI English Tutor setup at ${timestamp}
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

# DeepSeek 官方
DEEPSEEK_API_KEY=${deepseek_api_key}
DEEPSEEK_BASE_URL=${deepseek_base_url}
DEEPSEEK_MODEL=${deepseek_model}

# 火山方舟 LLM（OpenAI 兼容）
VOLCENGINE_LLM_API_KEY=${volcengine_llm_api_key}
VOLCENGINE_LLM_BASE_URL=${volcengine_llm_base_url}
VOLCENGINE_LLM_MODEL=${volcengine_llm_model}

# 小米 LLM（已停用，仅作字段参考）
XIAOMI_API_KEY=${xiaomi_api_key}
XIAOMI_BASE_URL=${xiaomi_base_url}
XIAOMI_MODEL=${xiaomi_model}

# ── TTS ──（browser / volcengine / xiaomi / cosyvoice）
TTS_PROVIDER=${tts_provider}

# Xiaomi TTS
XIAOMI_TTS_API_KEY=${tts_api_key}
XIAOMI_TTS_BASE_URL=${tts_base_url}
# voicedesign=按人设描述生成；preset=固定预置音色
XIAOMI_TTS_MODE=${tts_mode}
# voicedesign 英文兜底音色描述
XIAOMI_TTS_VOICE_DESIGN=成熟知性的御姐，声线低沉磁性、略带沙哑，慵懒从容，语速偏慢，句尾带轻气声
# 中文翻译音色
# XIAOMI_TTS_ZH_VOICE_DESIGN=台湾腔温柔女声，语速适中，声音甜美温暖

# Volcengine 火山方舟 Agent Plan 语音合成 TTS
VOLCENGINE_TTS_API_KEY=${volcengine_tts_api_key}
VOLCENGINE_TTS_RESOURCE_ID=${volcengine_tts_resource_id}
VOLCENGINE_TTS_SPEAKER=${volcengine_tts_speaker}
VOLCENGINE_TTS_FORMAT=${volcengine_tts_format}
VOLCENGINE_TTS_SAMPLE_RATE=${volcengine_tts_sample_rate}

# CosyVoice（需 GPU + docker-compose.cosyvoice.yml 叠加）
COSYVOICE_BASE_URL=http://cosyvoice:50000
COSYVOICE_SPK_ID=英文女
COSYVOICE_SPEED=0.9

# ── ASR ──（browser / volcengine / whisper / xiaomi）
ASR_PROVIDER=${asr_provider}

# Xiaomi ASR
XIAOMI_ASR_API_KEY=${asr_api_key}
XIAOMI_ASR_BASE_URL=${asr_base_url}
# XIAOMI_ASR_MODEL=mimo-v2.5-asr

# Volcengine 火山方舟 Agent Plan 语音识别 ASR
# ASR key 不填则回退到 TTS key
VOLCENGINE_ASR_API_KEY=${volcengine_asr_api_key}
VOLCENGINE_ASR_RESOURCE_ID=${volcengine_asr_resource_id}

# Whisper（需 docker-compose.whisper.yml 叠加）
WHISPER_BASE_URL=http://whisper:8080
WHISPER_MODEL=ggml-base.en.bin

# ── 通用语音参数（按需开启）──
# TTS_FORMAT=mp3
# TTS_SPEED=1.0
# ASR_LANGUAGE=auto
# MAX_AUDIO_SIZE_MB=10

# ── Data ──
DB_PATH=/app/data/tutor.db
CONFIG_DIR=/app/data
DATA_DIR=/app/data
TTS_CACHE_DIR=/app/data/tts-cache
TTS_CACHE_MAX_MB=1024
TTS_CACHE_MAX_FILES=5000
EOF

  log_info "已生成 .env: ${output_file}"
}
